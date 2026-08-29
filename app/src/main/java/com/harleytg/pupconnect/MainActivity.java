package com.harleytg.pupconnect;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.text.InputFilter;
import android.text.InputType;
import android.view.View;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import java.security.SecureRandom;
import java.util.Locale;

public class MainActivity extends Activity {
    private final SecureRandom random = new SecureRandom();

    private TextView screenTitle;
    private TextView screenSubtitle;
    private TextView emptyState;
    private View recentSection;
    private TextView navChats;
    private TextView navCalls;
    private TextView navPack;
    private TextView navSettings;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        screenTitle = findViewById(R.id.screenTitle);
        screenSubtitle = findViewById(R.id.screenSubtitle);
        emptyState = findViewById(R.id.emptyState);
        recentSection = findViewById(R.id.recentSection);

        navChats = findViewById(R.id.navChats);
        navCalls = findViewById(R.id.navCalls);
        navPack = findViewById(R.id.navPack);
        navSettings = findViewById(R.id.navSettings);

        findViewById(R.id.createRoomButton).setOnClickListener(v -> createRoom());
        findViewById(R.id.joinRoomButton).setOnClickListener(v -> showJoinRoomDialog());
        findViewById(R.id.headerAddButton).setOnClickListener(v -> createRoom());

        navChats.setOnClickListener(v -> selectSection(Section.CHATS));
        navCalls.setOnClickListener(v -> selectSection(Section.CALLS));
        navPack.setOnClickListener(v -> selectSection(Section.PACK));
        navSettings.setOnClickListener(v -> selectSection(Section.SETTINGS));

        selectSection(Section.CHATS);
    }

    private void createRoom() {
        int room = 100000 + random.nextInt(900000);
        String code = String.format(Locale.US, "%06d", room);
        new AlertDialog.Builder(this)
                .setTitle("Room created")
                .setMessage("Your Pup Connect room code is\n\n" + code + "\n\nWebRTC signaling will attach to this room flow next.")
                .setPositiveButton("Open room", (dialog, which) ->
                        Toast.makeText(this, "Opening room " + code, Toast.LENGTH_SHORT).show())
                .setNegativeButton("Close", null)
                .show();
    }

    private void showJoinRoomDialog() {
        EditText input = new EditText(this);
        input.setHint("6-digit room code");
        input.setInputType(InputType.TYPE_CLASS_NUMBER);
        input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(6)});
        int horizontal = (int) (20 * getResources().getDisplayMetrics().density);
        input.setPadding(horizontal, 0, horizontal, 0);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Join a room")
                .setMessage("Enter the room code shared by another Pup Connect user.")
                .setView(input)
                .setPositiveButton("Join", null)
                .setNegativeButton("Cancel", null)
                .create();

        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String code = input.getText().toString().trim();
            if (code.length() != 6) {
                input.setError("Enter all 6 digits");
                return;
            }
            dialog.dismiss();
            Toast.makeText(this, "Joining room " + code, Toast.LENGTH_SHORT).show();
        }));
        dialog.show();
    }

    private void selectSection(Section section) {
        navChats.setSelected(section == Section.CHATS);
        navCalls.setSelected(section == Section.CALLS);
        navPack.setSelected(section == Section.PACK);
        navSettings.setSelected(section == Section.SETTINGS);

        switch (section) {
            case CHATS:
                screenTitle.setText("Connect with your pack");
                screenSubtitle.setText("Private rooms for chat, voice and video");
                recentSection.setVisibility(View.VISIBLE);
                emptyState.setVisibility(View.GONE);
                break;
            case CALLS:
                showPlaceholder("Calls", "Recent voice and video calls will appear here.");
                break;
            case PACK:
                showPlaceholder("Pack", "Friends, trusted contacts and active room members will live here.");
                break;
            case SETTINGS:
                showPlaceholder("Settings", "Connection, privacy, audio, video and appearance controls will live here.");
                break;
        }
    }

    private void showPlaceholder(String title, String subtitle) {
        screenTitle.setText(title);
        screenSubtitle.setText(subtitle);
        recentSection.setVisibility(View.GONE);
        emptyState.setVisibility(View.VISIBLE);
        emptyState.setText(subtitle);
    }

    private enum Section {
        CHATS, CALLS, PACK, SETTINGS
    }
}
