import "./globals.css";

export const metadata = {
  title: "Help & Support Chatbot",
  description: "Ask about our policies, rules, and product.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}