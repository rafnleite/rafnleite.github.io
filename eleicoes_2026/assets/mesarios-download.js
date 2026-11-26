// O CSV está em outra origem. Use o nome indicado no link ao salvar o arquivo.
document.addEventListener("click", async event => {
  const link = event.target.closest("a[download]");
  if (!link || event.defaultPrevented || event.button !== 0 ||
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const url = new URL(link.href);
  if (url.hostname !== "raw.githubusercontent.com" || !url.pathname.endsWith(".csv")) return;
  event.preventDefault();
  if (link.getAttribute("aria-busy") === "true") return;
  link.setAttribute("aria-busy", "true");
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    const objectUrl = URL.createObjectURL(await response.blob());
    const download = document.createElement("a");
    download.href = objectUrl;
    download.download = link.download || decodeURIComponent(url.pathname.split("/").pop());
    document.body.append(download);
    download.click();
    download.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch {
    location.assign(link.href);
  } finally {
    link.removeAttribute("aria-busy");
  }
});
