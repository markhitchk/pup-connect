const params = new URLSearchParams(location.search),
  code = params.get("code"),
  invite = params.get("invite");
if (/^\d{6}$/.test(code || "") && /^[a-f0-9]{64}$/.test(invite || "")) {
  const link = document.getElementById("open");
  link.href = `pupconnect://join?code=${code}&invite=${invite}`;
  link.hidden = false;
  document.getElementById(
    "status"
  ).textContent = `Room ${code}. Invitations expire with the room.`;
}
