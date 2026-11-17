import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import { PupApp } from "../../App";
beforeEach(() => {
  require("../core/native").reset();
});
test("all four primary screens navigate and themes switch", async () => {
  const ui = await render(<PupApp />);
  await waitFor(() => expect(screen.getByText("No recent rooms")).toBeTruthy());
  await fireEvent.press(screen.getByRole("tab", { name: "Calls" }));
  await waitFor(() =>
    expect(screen.getByText("Start voice call")).toBeTruthy()
  );
  await fireEvent.press(screen.getByRole("tab", { name: "Pack" }));
  await waitFor(() =>
    expect(screen.getByText("Your room, your pack")).toBeTruthy()
  );
  await fireEvent.press(screen.getByRole("tab", { name: "Settings" }));
  await waitFor(() => expect(screen.getByText("App Settings")).toBeTruthy());
  await fireEvent.press(screen.getByRole("button", { name: "Dark" }));
  await waitFor(() =>
    expect(require("../core/native").vault.set).toHaveBeenCalledWith(
      "settings",
      expect.objectContaining({ theme: "dark" })
    )
  );
  await fireEvent.press(screen.getByRole("tab", { name: "Chats" }));
  await waitFor(() => expect(screen.getByText("No recent rooms")).toBeTruthy());
  await ui.unmount();
}, 15000);
test("room actions and join input are available without pretending to connect", async () => {
  const ui = await render(<PupApp />);
  await waitFor(() => expect(screen.getByText("No recent rooms")).toBeTruthy());
  await fireEvent.press(screen.getByRole("button", { name: "New room" }));
  await waitFor(() => expect(screen.getByText("Create Room")).toBeTruthy());
  await fireEvent.changeText(
    screen.getByLabelText("Room code or invitation"),
    "123456"
  );
  await fireEvent.press(screen.getByRole("button", { name: "Join Room" }));
  await waitFor(() =>
    expect(require("../../hive/generated").default.start).toHaveBeenCalled()
  );
  const { ipc } =
    await require("../../hive/generated").default.start.mock.results.at(-1)
      .value;
  await waitFor(() =>
    expect(
      ipc.write.mock.calls.some(([x]: [Uint8Array]) =>
        require("buffer").Buffer.from(x).toString().includes('"type":"join"')
      )
    ).toBe(true)
  );
  await ui.unmount();
}, 15000);
