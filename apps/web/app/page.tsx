import { APP_NAME } from "@askwell/shared";
import { Container } from "../components/Container";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50">
      <Container>
        <h1 className="text-4xl font-bold">{APP_NAME}</h1>
      </Container>
    </main>
  );
}
