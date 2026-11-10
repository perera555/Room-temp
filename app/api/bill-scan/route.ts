import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

/**
 * Read a photo / PDF of a utility bill with Claude and return its details as JSON.
 * Nothing is saved here: the app shows the result for checking, then saves records.
 *
 * POST multipart/form-data  file=<image or PDF>
 * Needs ANTHROPIC_API_KEY in Vercel. Protected by the dashboard password (see proxy.ts).
 */
export const maxDuration = 120; // reading a bill can take a little while

const LineSchema = z.object({
  connection: z.string().describe('Connection label on the bill, e.g. "D1", "D2", a phone number, or "" if the bill has one connection'),
  description: z.string().describe("Short description of this line, e.g. package or service name"),
  usage: z.number().describe("Amount used in this line: kWh for electricity, units (m³) for water, GB for data, kg for gas; 0 if not shown"),
  usage_unit: z.string().describe('"kWh", "units", "GB", "kg" or ""'),
  data_charge: z.number().describe("LKR charged for data / internet / rental in this line, 0 if none"),
  call_charge: z.number().describe("LKR charged for calls / SMS in this line, 0 if none"),
  tax: z.number().describe("LKR of taxes and levies (VAT, SSCL, telecom levy, etc.) in this line, 0 if none"),
  other_charge: z.number().describe("Any other LKR charges in this line (fixed charge, fuel adjustment, etc.)"),
  total: z.number().describe("LKR total for this line"),
});

const BillSchema = z.object({
  kind: z.enum(["electricity", "water", "telecom", "gas", "other"]),
  provider: z.string().describe("e.g. CEB, LECO, NWSDB, SLT-Mobitel, Dialog, Hutch, Airtel, Litro, Laugfs"),
  account_number: z.string(),
  customer_name: z.string(),
  address: z.string(),
  bill_date: z.string().describe("YYYY-MM-DD, or empty"),
  period_from: z.string().describe("Start of the billing period, YYYY-MM-DD"),
  period_to: z.string().describe("End of the billing period, YYYY-MM-DD"),
  bill_month: z.string().describe("Billing month, YYYY-MM"),
  total_amount: z.number().describe("Total LKR due for the current period (not including arrears if shown separately)"),
  previous_balance: z.number().describe("Arrears / previous balance in LKR, 0 if none"),
  lines: z.array(LineSchema),
  confidence_notes: z.string().describe("Anything unclear or unreadable on the bill"),
});

export type ScannedBill = z.infer<typeof BillSchema>;

const PROMPT = `This is a utility bill from Sri Lanka (amounts in LKR). Read it and fill in every field.
- Bill types: electricity (CEB / LECO), water (NWSDB / council), telecom, internet, mobile or data package (SLT-Mobitel, Mobitel, Dialog, Hutch, Airtel), gas (Litro / Laugfs receipt).
- Dates as YYYY-MM-DD. If only a month is shown, use its first and last day.
- Mobile / data bills and reload or data-package receipts (Mobitel, Dialog, Hutch, Airtel) are "telecom": put the mobile number in "connection" and the package name in "description".
- If the bill lists several connections (for example D1, D2, D3, or separate phone numbers), make one line per connection with its own data, call, tax and total. If the bill covers one connection, make a single line with connection "".
- Put taxes and levies in "tax", calls/SMS in "call_charge", data/internet/rental in "data_charge", anything else in "other_charge".
- Use numbers only (no commas or currency signs). Use 0 for anything not on the bill. Never guess a value you cannot read; mention it in confidence_notes instead.`;

const MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Bill reading is not set up yet: add ANTHROPIC_API_KEY in Vercel settings, then Redeploy." }, { status: 503 });
  }
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {}
  if (!file) return Response.json({ error: "Choose a photo or PDF of the bill" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return Response.json({ error: "File is too big (max 15 MB)" }, { status: 400 });

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const isPdf = file.type === "application/pdf";
  const imageType = (MEDIA as readonly string[]).includes(file.type) ? (file.type as (typeof MEDIA)[number]) : null;
  if (!isPdf && !imageType) return Response.json({ error: "Use a JPG, PNG, WEBP photo or a PDF" }, { status: 400 });

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // if a request is ever declined, the API retries it on a fallback model automatically
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(BillSchema) },
      messages: [
        {
          role: "user",
          content: [
            isPdf
              ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
              : { type: "image", source: { type: "base64", media_type: imageType!, data } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ error: "The bill could not be read. Please enter it by hand." }, { status: 422 });
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return Response.json({ error: "Could not read all of the bill. Try a clearer photo." }, { status: 422 });
    }
    return Response.json({ ok: true, bill: response.parsed_output });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "The ANTHROPIC_API_KEY in Vercel is not valid." }, { status: 502 });
    } else if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Too many bills at once. Wait a minute and try again." }, { status: 429 });
    } else if (err instanceof Anthropic.BadRequestError) {
      return Response.json({ error: `The bill file was not accepted: ${err.message}` }, { status: 400 });
    } else if (err instanceof Anthropic.APIError) {
      return Response.json({ error: `Bill reader error (${err.status}). Try again.` }, { status: 502 });
    }
    console.error("[bill-scan]", err);
    return Response.json({ error: "Bill reader is not reachable. Try again." }, { status: 502 });
  }
}
