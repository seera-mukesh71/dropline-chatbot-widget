const nextConfig = {
  async headers() {
    return [
      {
        source: "/widget",
        headers: [
          // Allow this page to be framed by other websites.
          // For production, restrict it, e.g.:
          // "frame-ancestors 'self' https://yourwebsite.com"
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;