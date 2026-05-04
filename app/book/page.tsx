import { redirect } from "next/navigation";

// /book/[slug] is a per-workspace public booking page; bare /book
// has nothing to render. Forward to /book-demo so a visitor who
// trimmed the URL still lands on something useful (Praxxii Global's
// own demo booking page).
export default function BookIndex(): never {
  redirect("/book-demo");
}
