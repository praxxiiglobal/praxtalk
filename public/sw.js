// PraxTalk push service worker. Receives encrypted push payloads from
// the browser's push service (FCM / Mozilla / Apple), shows a system
// notification, and routes clicks back into the dashboard.

self.addEventListener("push", (event) => {
  let data = { title: "PraxTalk", body: "", url: "/app" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall through with defaults.
  }
  const options = {
    body: data.body,
    icon: "/icon.png",
    badge: "/icon.png",
    data: { url: data.url },
    tag: "praxtalk-message",
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/app";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // If the dashboard is already open, focus it and navigate.
        for (const client of clients) {
          if (client.url.includes("/app")) {
            client.focus();
            if ("navigate" in client) client.navigate(url);
            return;
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
