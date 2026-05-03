import { redirect } from "next/navigation";

/**
 * /sign-up is the canonical CTA URL referenced from marketing pages.
 * The actual workspace-bootstrap flow lives at /setup; redirect so the
 * old path keeps working and the marketing copy can stay aspirational.
 */
export const metadata = {
  title: "Sign up · PraxTalk",
  alternates: { canonical: "/sign-up" },
};

export default function SignUpPage() {
  redirect("/setup");
}
