import type { Metadata } from "next";
import { Report } from "@/components/Report";

export const metadata: Metadata = { title: "Property report — Room Temp" };

export default function ReportPage() {
  return <Report />;
}
