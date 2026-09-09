import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vulnerabilities - BugShield",
  description: "Review and manage detected vulnerabilities",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
