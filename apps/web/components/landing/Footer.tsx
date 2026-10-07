import { APP_NAME } from "@askwell/shared";
import { Container } from "../Container";

export function Footer() {
  return (
    <footer className="border-t border-slate-800 py-10">
      <Container>
        <p className="text-center text-sm text-slate-500">
          &copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.
        </p>
      </Container>
    </footer>
  );
}
