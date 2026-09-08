import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { I18nProvider } from "@/lib/i18n-context";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Vibe Manager AI - Plataforma de Prompts y PRs",
  description: "Interfaz para creación y validación de prompts de código con ejecución en Docker y PRs en GitHub",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased flex flex-col">
        <I18nProvider>
          <ThemeProvider>
            <AuthProvider>
              <Navbar />
              <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
                {children}
              </main>
            </AuthProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
