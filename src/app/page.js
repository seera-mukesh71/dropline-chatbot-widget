import Script from "next/script";

export default function Home() {
  return (
    <main className="page">
      <div className="demoContent">
        <h1>Demo Website</h1>
        <p>
          This is a plain page standing in for your real website. The chat
          bubble appears in the bottom-right corner. This is exactly how the
          chatbot will look once embedded on any site.
        </p>
      </div>

      {/* This single line is all another website needs to add */}
      <Script src="/embed.js" strategy="afterInteractive" />
    </main>
  );
}