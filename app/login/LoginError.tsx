"use client";

import { useEffect, useState } from "react";

export function LoginError() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(new URLSearchParams(window.location.search).has("error"));
  }, []);
  if (!show) return null;
  return <p className="mt-2 text-sm text-red-300">Wrong password — please try again.</p>;
}
