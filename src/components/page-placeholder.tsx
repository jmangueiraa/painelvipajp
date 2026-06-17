import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function PagePlaceholder({
  title,
  description,
  hint,
}: {
  title: string;
  description: string;
  hint?: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>
      <Card className="border-dashed">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <div className="size-10 rounded-lg bg-accent flex items-center justify-center">
            <Construction className="size-5 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-base">Em construção</CardTitle>
            <CardDescription>{hint ?? "Esta seção será habilitada nas próximas etapas."}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Sua conta já está pronta e protegida. Continue para liberarmos as funcionalidades desta área.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
