"use client";
import { Button } from "@/components/ui/button";
export function PrintAdmissionButton() {
  return (
    <div className="space-y-2 print:hidden">
      <Button onClick={() => window.print()}>
        Print / Save PDF
      </Button>
      <p className="max-w-xl text-xs text-muted-foreground">
        Use A4 at 100% scale and disable browser headers/footers. Review every page in print preview. Printing does not record admission or payment.</p>
    </div>
  );
}
