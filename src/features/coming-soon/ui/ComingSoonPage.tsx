import { Hammer } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ComingSoonPage() {
  return (
    <div className="w-full flex-1 min-h-0 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg border border-border bg-card/60 text-card-foreground rounded-2xl p-6 text-center">
        <CardHeader className="pb-2">
          <div className="mx-auto p-3 rounded-full bg-[var(--accent-light)] text-[var(--accent-color)] w-12 h-12 flex items-center justify-center mb-2">
            <Hammer className="w-6 h-6 animate-pulse" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">Feature Under Construction</CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1">
            This module is currently in development.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            We are working hard to bring you new capabilities in the next release of Computer Toolkit. Please check back later.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
