import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: 480 }}>
          <h1>Acceso - Caja Simplificada</h1>
          <section className="ledger-card">
            <p className="empty-state">Cargando formulario...</p>
          </section>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
