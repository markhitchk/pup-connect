package com.harleytg.pupconnect;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputFilter;
import android.text.InputType;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.security.SecureRandom;
import java.util.Locale;

public class MainActivity extends Activity {
    private final SecureRandom random = new SecureRandom();
    private final Handler handler = new Handler(Looper.getMainLooper());

    private View pageChats;
    private View pageCalls;
    private View pagePack;
    private View pageSettings;
    private View drawerPanel;
    private View drawerScrim;
    private View startupOverlay;

    private TextView navChats;
    private TextView navCalls;
    private TextView navPack;
    private TextView navSettings;
    private TextView appHeaderSubtitle;
    private TextView connectionDetail;
    private TextView relayBadge;
    private TextView welcomeBanner;
    private TextView liveStatusBadge;

    private Section currentSection = Section.CHATS;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        bindViews();
        wireNavigation();
        wireRoomActions();
        wireSettings();
        selectSection(Section.CHATS);
        runStartupAnimation();
    }

    private void bindViews() {
        pageChats = findViewById(R.id.pageChats);
        pageCalls = findViewById(R.id.pageCalls);
        pagePack = findViewById(R.id.pagePack);
        pageSettings = findViewById(R.id.pageSettings);
        drawerPanel = findViewById(R.id.drawerPanel);
        drawerScrim = findViewById(R.id.drawerScrim);
        startupOverlay = findViewById(R.id.startupOverlay);

        navChats = findViewById(R.id.navChats);
        navCalls = findViewById(R.id.navCalls);
        navPack = findViewById(R.id.navPack);
        navSettings = findViewById(R.id.navSettings);
        appHeaderSubtitle = findViewById(R.id.appHeaderSubtitle);
        connectionDetail = findViewById(R.id.connectionDetail);
        relayBadge = findViewById(R.id.relayBadge);
        welcomeBanner = findViewById(R.id.welcomeBanner);
        liveStatusBadge = findViewById(R.id.liveStatusBadge);
    }

    private void wireNavigation() {
        findViewById(R.id.drawerButton).setOnClickListener(v -> openDrawer());
        drawerScrim.setOnClickListener(v -> closeDrawer());

        navChats.setOnClickListener(v -> selectSection(Section.CHATS));
        navCalls.setOnClickListener(v -> selectSection(Section.CALLS));
        navPack.setOnClickListener(v -> selectSection(Section.PACK));
        navSettings.setOnClickListener(v -> selectSection(Section.SETTINGS));
        findViewById(R.id.navCreate).setOnClickListener(v -> createRoom());

        findViewById(R.id.drawerChats).setOnClickListener(v -> selectFromDrawer(Section.CHATS));
        findViewById(R.id.drawerCalls).setOnClickListener(v -> selectFromDrawer(Section.CALLS));
        findViewById(R.id.drawerPack).setOnClickListener(v -> selectFromDrawer(Section.PACK));
        findViewById(R.id.drawerSettings).setOnClickListener(v -> selectFromDrawer(Section.SETTINGS));

        findViewById(R.id.drawerIdentityCard).setOnClickListener(v -> selectFromDrawer(Section.PACK));
        findViewById(R.id.drawerSecurity).setOnClickListener(v -> {
            selectFromDrawer(Section.SETTINGS);
            showSecurityDialog();
        });

        findViewById(R.id.headerNotificationsButton).setOnClickListener(v -> showActivityDialog());
        findViewById(R.id.drawerConnection).setOnClickListener(v -> {
            closeDrawer();
            showConnectionDialog();
        });
        findViewById(R.id.drawerAbout).setOnClickListener(v -> {
            closeDrawer();
            showAboutDialog();
        });

        findViewById(R.id.reconnectButton).setOnClickListener(v -> simulateReconnect());
    }

    private void wireRoomActions() {
        findViewById(R.id.createRoomButton).setOnClickListener(v -> createRoom());
        findViewById(R.id.joinRoomButton).setOnClickListener(v -> showJoinRoomDialog());
        findViewById(R.id.drawerCreateRoom).setOnClickListener(v -> {
            closeDrawer();
            createRoom();
        });
        findViewById(R.id.drawerJoinRoom).setOnClickListener(v -> {
            closeDrawer();
            showJoinRoomDialog();
        });
    }

    private void wireSettings() {
        findViewById(R.id.settingsConnection).setOnClickListener(v -> showConnectionDialog());
        findViewById(R.id.settingsPrivacy).setOnClickListener(v -> showSecurityDialog());
        findViewById(R.id.settingsMedia).setOnClickListener(v -> showMediaDialog());
        findViewById(R.id.settingsAppearance).setOnClickListener(v -> new AlertDialog.Builder(this)
                .setTitle("Appearance")
                .setMessage("Pup Connect currently follows your Android light/dark theme using the same dual-palette approach as the HCF app. Manual System / Light / Dark controls can be added next.")
                .setPositiveButton("OK", null)
                .show());
        findViewById(R.id.settingsDiagnostics).setOnClickListener(v -> showDiagnosticsDialog());
    }

    private void runStartupAnimation() {
        startupOverlay.setAlpha(1f);
        handler.postDelayed(() -> startupOverlay.animate()
                .alpha(0f)
                .setDuration(280)
                .withEndAction(() -> {
                    startupOverlay.setVisibility(View.GONE);
                    startupOverlay.setAlpha(1f);
                }), 520);
    }

    private void openDrawer() {
        drawerScrim.setVisibility(View.VISIBLE);
        drawerPanel.setVisibility(View.VISIBLE);
        drawerPanel.setTranslationX(-dp(30));
        drawerPanel.setAlpha(0f);
        drawerPanel.animate().translationX(0f).alpha(1f).setDuration(170).start();
    }

    private void closeDrawer() {
        if (drawerPanel.getVisibility() != View.VISIBLE) {
            return;
        }
        drawerPanel.animate().translationX(-dp(24)).alpha(0f).setDuration(130).withEndAction(() -> {
            drawerPanel.setVisibility(View.GONE);
            drawerPanel.setTranslationX(0f);
            drawerPanel.setAlpha(1f);
            drawerScrim.setVisibility(View.GONE);
        }).start();
    }

    private void selectFromDrawer(Section section) {
        closeDrawer();
        selectSection(section);
    }

    private void selectSection(Section section) {
        currentSection = section;

        pageChats.setVisibility(section == Section.CHATS ? View.VISIBLE : View.GONE);
        pageCalls.setVisibility(section == Section.CALLS ? View.VISIBLE : View.GONE);
        pagePack.setVisibility(section == Section.PACK ? View.VISIBLE : View.GONE);
        pageSettings.setVisibility(section == Section.SETTINGS ? View.VISIBLE : View.GONE);

        navChats.setSelected(section == Section.CHATS);
        navCalls.setSelected(section == Section.CALLS);
        navPack.setSelected(section == Section.PACK);
        navSettings.setSelected(section == Section.SETTINGS);

        switch (section) {
            case CHATS:
                appHeaderSubtitle.setText("Private rooms • Ready");
                welcomeBanner.setText("Pup Connect • Local identity active • Private by default");
                break;
            case CALLS:
                appHeaderSubtitle.setText("Voice & video • Ready");
                welcomeBanner.setText("Calls • Microphone and camera stay off until requested");
                break;
            case PACK:
                appHeaderSubtitle.setText("Local identity • Private");
                welcomeBanner.setText("Pack • Your local identity and trusted contacts");
                break;
            case SETTINGS:
                appHeaderSubtitle.setText("App control center");
                welcomeBanner.setText("Settings • Connection, privacy, calls and diagnostics");
                break;
        }

        View page = section == Section.CHATS ? pageChats
                : section == Section.CALLS ? pageCalls
                : section == Section.PACK ? pagePack : pageSettings;
        page.setAlpha(0.86f);
        page.animate().alpha(1f).setDuration(120).start();
    }

    private void createRoom() {
        int room = 100000 + random.nextInt(900000);
        String code = String.format(Locale.US, "%06d", room);
        connectionDetail.setText("Room " + code + " • Waiting for peers");
        liveStatusBadge.setText("Hosting");
        relayBadge.setText("AUTO");

        new AlertDialog.Builder(this)
                .setTitle("Room created")
                .setMessage("Your Pup Connect room code is\n\n" + code
                        + "\n\nShare this code with someone you trust. The current build has the complete room UI shell; live WebRTC signaling is the next networking layer.")
                .setPositiveButton("Open room", (dialog, which) -> {
                    selectSection(Section.CHATS);
                    Toast.makeText(this, "Room " + code + " ready", Toast.LENGTH_SHORT).show();
                })
                .setNeutralButton("Copy later", null)
                .setNegativeButton("Close", null)
                .show();
    }

    private void showJoinRoomDialog() {
        EditText input = new EditText(this);
        input.setHint("6-digit room code");
        input.setInputType(InputType.TYPE_CLASS_NUMBER);
        input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(6)});
        input.setTextColor(getColor(R.color.pc_text));
        input.setHintTextColor(getColor(R.color.pc_hint));
        input.setSingleLine(true);

        LinearLayout wrapper = new LinearLayout(this);
        wrapper.setPadding(dp(20), dp(4), dp(20), 0);
        wrapper.addView(input, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Join a room")
                .setMessage("Enter the six-digit code shared by another Pup Connect user.")
                .setView(wrapper)
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
            selectSection(Section.CHATS);
            connectionDetail.setText("Room " + code + " • Connecting");
            liveStatusBadge.setText("Joining");
            handler.postDelayed(() -> {
                connectionDetail.setText("Room " + code + " • Ready for signaling");
                liveStatusBadge.setText("Ready");
            }, 650);
        }));
        dialog.show();
    }

    private void simulateReconnect() {
        connectionDetail.setText("Checking WebRTC path…");
        liveStatusBadge.setText("Check");
        relayBadge.setText("TEST");
        handler.postDelayed(() -> {
            connectionDetail.setText("Ready • WebRTC room service");
            liveStatusBadge.setText("Ready");
            relayBadge.setText("AUTO");
            Toast.makeText(this, "Connection shell ready", Toast.LENGTH_SHORT).show();
        }, 700);
    }

    private void showActivityDialog() {
        new AlertDialog.Builder(this)
                .setTitle("Pup Connect activity")
                .setMessage("1 setup notice\n\n• HCF-style interface loaded\n• Local identity active\n• WebRTC signaling is not connected yet")
                .setPositiveButton("Mark read", (dialog, which) ->
                        findViewById(R.id.headerNotificationCountBadge).setVisibility(View.GONE))
                .setNegativeButton("Close", null)
                .show();
    }

    private void showConnectionDialog() {
        new AlertDialog.Builder(this)
                .setTitle("Connection status")
                .setMessage("Transport: WebRTC\nPeer path: Automatic\nSTUN/TURN: Configuration pending\nSignaling: Not connected yet\nRoom identity: Local device\n\nThe UI is structured so the signaling and peer engine can plug in without redesigning these screens.")
                .setPositiveButton("Run check", (dialog, which) -> simulateReconnect())
                .setNegativeButton("Close", null)
                .show();
    }

    private void showSecurityDialog() {
        new AlertDialog.Builder(this)
                .setTitle("Privacy & security")
                .setMessage("• Local-first identity\n• Private rooms by default\n• Microphone/camera only on request\n• No chat cloud sync enabled\n• TURN relay credentials will never be hardcoded into the app\n\nEnd-to-end room security controls will be tied to the WebRTC engine when networking is added.")
                .setPositiveButton("OK", null)
                .show();
    }

    private void showMediaDialog() {
        new AlertDialog.Builder(this)
                .setTitle("Audio & video")
                .setMessage("Planned HCF-style call controls:\n\n• Microphone mute\n• Camera toggle\n• Speaker / earpiece routing\n• Push-to-talk\n• Video quality\n• Noise suppression\n• Screen sharing")
                .setPositiveButton("OK", null)
                .show();
    }

    private void showDiagnosticsDialog() {
        new AlertDialog.Builder(this)
                .setTitle("Diagnostics")
                .setMessage("Pup Connect 0.1.0-alpha\nPackage: com.harleytg.pupconnect\nMinimum Android: API 26\nTarget Android: API 35\nUI: Native Java/XML\nTheme: HCF-derived light/dark shell\nTransport target: WebRTC")
                .setPositiveButton("OK", null)
                .show();
    }

    private void showAboutDialog() {
        new AlertDialog.Builder(this)
                .setTitle("About Pup Connect")
                .setMessage("Pup Connect\nHarley’s Clan Communication Network\n\nA private room-based chat, voice and video app designed around WebRTC and the Harley’s Clan Forum app design language.")
                .setPositiveButton("OK", null)
                .show();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    public void onBackPressed() {
        if (drawerPanel != null && drawerPanel.getVisibility() == View.VISIBLE) {
            closeDrawer();
            return;
        }
        if (currentSection != Section.CHATS) {
            selectSection(Section.CHATS);
            return;
        }
        super.onBackPressed();
    }

    private enum Section {
        CHATS, CALLS, PACK, SETTINGS
    }
}
