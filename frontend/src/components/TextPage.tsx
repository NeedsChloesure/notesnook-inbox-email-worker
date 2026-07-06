import type { ReactNode } from "react";

export function TextPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="screen">
      <div className="stack">
        <div className="card prose">
          <h1>{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}