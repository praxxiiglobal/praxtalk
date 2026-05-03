import type { Metadata } from "next";
import { BookView } from "./BookView";

export const metadata: Metadata = {
  title: "Book a slot · PraxTalk",
  robots: { index: false, follow: false },
};

export default async function BookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <BookView slug={slug} />;
}
