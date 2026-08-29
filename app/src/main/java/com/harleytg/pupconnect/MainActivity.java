package com.harleytg.pupconnect;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputFilter;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.security.SecureRandom;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String PREFS = "pup_connect";
    private static final String PREF_NAME = "identity_name";
    private static final String PREF_LAST_ROOM = "last_room";
    private static final String PREF_LAST_ROOM_MODE = "last_room_mode";
    private static final String MESSAGE_PREFIX = "messages_";
    private static final int REQUEST_VOICE = 401;
    private static final int REQUEST_VIDEO = 402;

    private final SecureRandom random = new SecureRandom();
    private final Handler handler = new Handler(Looper.getMainLooper());

    private SharedPreferences prefs;

    private View pageChats;
    private View pageCalls;
    private View pageAlerts;
    private View pageMe;
    private View pageSettings;
    private View drawerPanel;
    private View drawerScrim;
    private View statusOverlay;
    private View startupStateContainer;
    private View errorStateContainer;
    private View chatListScroll;
    private View roomPanel;
    private View setupNoticeCard;

    private TextView bottomChats;
    private TextView bottomCalls;
    private TextView bottomAlerts;
    private TextView bottomMe;
    private TextView appHeaderSubtitle;
    private TextView connectionDetail;
    private TextView hostBadge;
    private TextView liveStatusBadge;
    private TextView welcomeBanner;
    private TextView recentRoomTitle;
    private TextView recentRoomSubtitle;
    private TextView recentRoomBadge;
    private TextView roomTitle;
    private TextView roomStatus;
    private TextView callStateText;
    private TextView profileNameText;
    private TextView drawerIdentityText;
    private TextView drawerHostText;
    private TextView notificationBadge;

    private LinearLayout messageList;
    private ScrollView messageScroll;
    private EditText messageInput;

    private Screen currentScreen = Screen.CHATS;
    private String activeRoomCode;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        bindViews();
        wireShell();
        wireRoomActions();
        wireCalls();
        wireIdentityAndSettings();
        updateIdentityUi();
        updateRecentRoomUi();
        selectScreen(Screen.CHATS);
        runStartupState();
    }

    private void bindViews() {
        pageChats = findViewById(R.id.pageChats);
        pageCalls = findViewById(R.id.pageCalls);
        pageAlerts = findViewById(R.id.pageAlerts);
        pageMe = findViewById(R.id.pageMe);
        pageSettings = findViewById(R.id.pageSettings);
        drawerPanel = findViewById(R.id.drawerPanel);
        drawerScrim = findViewById(R.id.drawerScrim);
        statusOverlay = findViewById(R.id.statusOverlay);
        startupStateContainer = findViewById(R.id.startupStateContainer);
        errorStateContainer = findViewById(R.id.errorStateContainer);
        chatListScroll = findViewById(R.id.chatListScroll);
        roomPanel = findViewById(R.id.roomPanel);
        setupNoticeCard = findViewById(R.id.setupNoticeCard);

        bottomChats = findViewById(R.id.bottomChats);
        bottomCalls = findViewById(R.id.bottomCalls);
        bottomAlerts = findViewById(R.id.bottomAlerts);
        bottomMe = findViewById(R.id.bottomMe);
        appHeaderSubtitle = findViewById(R.id.appHeaderSubtitle);
        connectionDetail = findViewById(R.id.connectionDetail);
        hostBadge = findViewById(R.id.hostBadge);
        liveStatusBadge = findViewById(R.id.liveStatusBadge);
        welcomeBanner = findViewById(R.id.welcomeBanner);
        recentRoomTitle = findViewById(R.id.recentRoomTitle);
        recentRoomSubtitle = findViewById(R.id.recentRoomSubtitle);
        recentRoomBadge = findViewById(R.id.recentRoomBadge);
        roomTitle = findViewById(R.id.roomTitle);
        roomStatus = findViewById(R.id.roomStatus);
        callStateText = findViewById(R.id.callStateText);
        profileNameText = findViewById(R.id.profileNameText);
        drawerIdentityText = findViewById(R.id.drawerIdentityText);
        drawerHostText = findViewById(R.id.drawerHostText);
        notificationBadge = findViewById(R.id.headerNotificationCountBadge);

        messageList = findViewById(R.id.messageList);
        messageScroll = findViewById(R.id.messageScroll);
        messageInput = findViewById(R.id.messageInput);
    }

    private void wireShell() {
        findViewById(R.id.drawerButton).setOnClickListener(v -> openDrawer());
        drawerScrim.setOnClickListener(v -> closeDrawer());

        bottomChats.setOnClickListener(v -> selectScreen(Screen.CHATS));
        bottomCalls.setOnClickListener(v -> selectScreen(Screen.CALLS));
        findViewById(R.id.bottomCreate).setOnClickListener(v -> showRoomActions());
        bottomAlerts.setOnClickListener(v -> selectScreen(Screen.ALERTS));
        bottomMe.setOnClickListener(v -> selectScreen(Screen.ME));

        findViewById(R.id.contextBackButton).setOnClickListener(v -> navigateBackInsideApp());
        findViewById(R.id.contextHomeButton).setOnClickListener(v -> {
            leaveRoomView();
            selectScreen(Screen.CHATS);
        });
        findViewById(R.id.reconnectButton).setOnClickListener(v -> runConnectionCheck());
        findViewById(R.id.copyContextButton).setOnClickListener(v -> copyCurrentContext());

        findViewById(R.id.headerNotificationsButton).setOnClickListener(v -> selectScreen(Screen.ALERTS));
        findViewById(R.id.markAlertsReadButton).setOnClickListener(v -> markAlertsRead());

        findViewById(R.id.drawerChats).setOnClickListener(v -> selectFromDrawer(Screen.CHATS));
        findViewById(R.id.drawerCalls).setOnClickListener(v -> selectFromDrawer(Screen.CALLS));
        findViewById(R.id.drawerAlerts).setOnClickListener(v -> selectFromDrawer(Screen.ALERTS));
        findViewById(R.id.drawerSettings).setOnClickListener(v -> selectFromDrawer(Screen.SETTINGS));
        findViewById(R.id.drawerIdentityCard).setOnClickListener(v -> selectFromDrawer(Screen.ME));
        findViewById(R.id.drawerSecurity).setOnClickListener(v -> {
            closeDrawer();
            selectScreen(Screen.ME);
            showSecurityDialog();
        });
        findViewById(R.id.drawerSupport).setOnClickListener(v -> {
            closeDrawer();
            openSupportEmail();
        });

        findViewById(R.id.retryButton).setOnClickListener(v -> retryFromErrorState());
        findViewById(R.id.continueOfflineButton).setOnClickListener(v -> continueLocally());
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
        findViewById(R.id.recentRoomCard).setOnClickListener(v -> openLastRoom());
        findViewById(R.id.shareRoomButton).setOnClickListener(v -> shareActiveRoom());
        findViewById(R.id.sendMessageButton).setOnClickListener(v -> sendLocalMessage());
        messageInput.setOnEditorActionListener((v, actionId, event) -> {
            if (messageInput.getText().toString().trim().isEmpty()) {
                return false;
            }
            sendLocalMessage();
            return true;
        });
    }

    private void wireCalls() {
        findViewById(R.id.startVoiceButton).setOnClickListener(v -> startVoiceControls());
        findViewById(R.id.startVideoButton).setOnClickListener(v -> startVideoControls());
    }

    private void wireIdentityAndSettings() {
        findViewById(R.id.editIdentityButton).setOnClickListener(v -> showEditIdentityDialog());
        findViewById(R.id.securityButton).setOnClickListener(v -> showSecurityDialog());
        findViewById(R.id.settingsButton).setOnClickListener(v -> selectScreen(Screen.SETTINGS));

        findViewById(R.id.settingsConnection).setOnClickListener(v -> showConnectionDialog());
        findViewById(R.id.settingsPrivacy).setOnClickListener(v -> showSecurityDialog());
        findViewById(R.id.settingsMedia).setOnClickListener(v -> showMediaDialog());
        findViewById(R.id.settingsDiagnostics).setOnClickListener(v -> showDiagnosticsDialog());
    }

    private void runStartupState() {
        statusOverlay.setVisibility(View.VISIBLE);
        startupStateContainer.setVisibility(View.VISIBLE);
        errorStateContainer.setVisibility(View.GONE);
        TextView subtitle = findViewById(R.id.statusSubtitle);
        subtitle.setText(isNetworkAvailable() ? "Local identity ready • network available" : "Offline • local mode available");

        handler.postDelayed(() -> statusOverlay.animate()
                .alpha(0f)
                .setDuration(220)
                .withEndAction(() -> {
                    statusOverlay.setVisibility(View.GONE);
                    statusOverlay.setAlpha(1f);
                    if (!isNetworkAvailable()) {
                        showBanner("Offline • local rooms and saved messages still work");
                    }
                }), 430);
    }

    private void openDrawer() {
        drawerScrim.setVisibility(View.VISIBLE);
        drawerPanel.setVisibility(View.VISIBLE);
        drawerPanel.setTranslationX(-dp(28));
        drawerPanel.setAlpha(0f);
        drawerPanel.animate().translationX(0f).alpha(1f).setDuration(160).start();
    }

    private void closeDrawer() {
        if (drawerPanel.getVisibility() != View.VISIBLE) {
            return;
        }
        drawerPanel.animate().translationX(-dp(20)).alpha(0f).setDuration(120).withEndAction(() -> {
            drawerPanel.setVisibility(View.GONE);
            drawerPanel.setTranslationX(0f);
            drawerPanel.setAlpha(1f);
            drawerScrim.setVisibility(View.GONE);
        }).start();
    }

    private void selectFromDrawer(Screen screen) {
        closeDrawer();
        selectScreen(screen);
    }

    private void selectScreen(Screen screen) {
        currentScreen = screen;

        pageChats.setVisibility(screen == Screen.CHATS ? View.VISIBLE : View.GONE);
        pageCalls.setVisibility(screen == Screen.CALLS ? View.VISIBLE : View.GONE);
        pageAlerts.setVisibility(screen == Screen.ALERTS ? View.VISIBLE : View.GONE);
        pageMe.setVisibility(screen == Screen.ME ? View.VISIBLE : View.GONE);
        pageSettings.setVisibility(screen == Screen.SETTINGS ? View.VISIBLE : View.GONE);

        bottomChats.setSelected(screen == Screen.CHATS);
        bottomCalls.setSelected(screen == Screen.CALLS);
        bottomAlerts.setSelected(screen == Screen.ALERTS);
        bottomMe.setSelected(screen == Screen.ME || screen == Screen.SETTINGS);

        switch (screen) {
            case CHATS:
                appHeaderSubtitle.setText(activeRoomCode == null ? "Private chat • Local" : "Room " + activeRoomCode + " • Local");
                break;
            case CALLS:
                appHeaderSubtitle.setText("Voice & video • Room based");
                break;
            case ALERTS:
                appHeaderSubtitle.setText("Activity • On device");
                break;
            case ME:
                appHeaderSubtitle.setText("Local identity • Private");
                break;
            case SETTINGS:
                appHeaderSubtitle.setText("App control center");
                break;
        }
    }

    private void showRoomActions() {
        new AlertDialog.Builder(this)
                .setTitle("New room")
                .setItems(new String[]{"Create room", "Join with code"}, (dialog, which) -> {
                    if (which == 0) {
                        createRoom();
                    } else {
                        showJoinRoomDialog();
                    }
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void createRoom() {
        String code = String.format(Locale.US, "%06d", 100000 + random.nextInt(900000));
        prefs.edit()
                .putString(PREF_LAST_ROOM, code)
                .putString(PREF_LAST_ROOM_MODE, "Hosted")
                .apply();
        updateRecentRoomUi();
        openRoom(code, "Hosted");
        addSystemMessageIfEmpty(code, "Room " + code + " created on this device.");
        showBanner("Room " + code + " created • Share the code with your contact");
    }

    private void showJoinRoomDialog() {
        EditText input = new EditText(this);
        input.setHint("6-digit room code");
        input.setInputType(InputType.TYPE_CLASS_NUMBER);
        input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(6)});
        input.setSingleLine(true);
        input.setTextColor(getColor(R.color.pc_text));
        input.setHintTextColor(getColor(R.color.pc_hint));

        LinearLayout wrapper = new LinearLayout(this);
        wrapper.setPadding(dp(20), dp(4), dp(20), 0);
        wrapper.addView(input, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Join a room")
                .setMessage("Enter the six-digit Pup Connect room code.")
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
            prefs.edit()
                    .putString(PREF_LAST_ROOM, code)
                    .putString(PREF_LAST_ROOM_MODE, "Joined")
                    .apply();
            updateRecentRoomUi();
            openRoom(code, "Joined");
            addSystemMessageIfEmpty(code, "Room " + code + " opened locally. Peer signaling is not linked yet.");
            showBanner("Room " + code + " opened");
        }));
        dialog.show();
    }

    private void openLastRoom() {
        String code = prefs.getString(PREF_LAST_ROOM, "");
        if (code == null || code.isEmpty()) {
            showRoomActions();
            return;
        }
        openRoom(code, prefs.getString(PREF_LAST_ROOM_MODE, "Local"));
    }

    private void openRoom(String code, String mode) {
        activeRoomCode = code;
        selectScreen(Screen.CHATS);
        chatListScroll.setVisibility(View.GONE);
        roomPanel.setVisibility(View.VISIBLE);
        roomTitle.setText("Room " + code);
        roomStatus.setText(mode + " • Local message store");
        connectionDetail.setText("Room " + code + " • Local session");
        hostBadge.setText("ROOM");
        liveStatusBadge.setText("Room");
        drawerHostText.setText("Local • Room " + code);
        appHeaderSubtitle.setText("Room " + code + " • Local");
        loadMessages(code);
    }

    private void leaveRoomView() {
        if (roomPanel.getVisibility() == View.VISIBLE) {
            roomPanel.setVisibility(View.GONE);
            chatListScroll.setVisibility(View.VISIBLE);
        }
        activeRoomCode = null;
        connectionDetail.setText("No active room");
        hostBadge.setText("P2P");
        liveStatusBadge.setText("Local");
        drawerHostText.setText("Local • No active room");
        if (currentScreen == Screen.CHATS) {
            appHeaderSubtitle.setText("Private chat • Local");
        }
    }

    private void sendLocalMessage() {
        if (activeRoomCode == null) {
            Toast.makeText(this, "Open a room first", Toast.LENGTH_SHORT).show();
            return;
        }
        String text = messageInput.getText().toString().trim();
        if (text.isEmpty()) {
            return;
        }
        appendMessage(activeRoomCode, "You", text);
        addMessageBubble("You", text, true);
        messageInput.setText("");
        scrollMessagesToBottom();
    }

    private void addSystemMessageIfEmpty(String roomCode, String text) {
        JSONArray messages = readMessageArray(roomCode);
        if (messages.length() > 0) {
            return;
        }
        appendMessage(roomCode, "Pup Connect", text);
        if (roomCode.equals(activeRoomCode)) {
            loadMessages(roomCode);
        }
    }

    private void appendMessage(String roomCode, String sender, String text) {
        JSONArray messages = readMessageArray(roomCode);
        JSONObject message = new JSONObject();
        try {
            message.put("sender", sender);
            message.put("text", text);
            messages.put(message);
            prefs.edit().putString(MESSAGE_PREFIX + roomCode, messages.toString()).apply();
        } catch (JSONException ignored) {
            Toast.makeText(this, "Message could not be saved", Toast.LENGTH_SHORT).show();
        }
    }

    private JSONArray readMessageArray(String roomCode) {
        String raw = prefs.getString(MESSAGE_PREFIX + roomCode, "[]");
        try {
            return new JSONArray(raw == null ? "[]" : raw);
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    private void loadMessages(String roomCode) {
        messageList.removeAllViews();
        JSONArray messages = readMessageArray(roomCode);
        for (int i = 0; i < messages.length(); i++) {
            JSONObject message = messages.optJSONObject(i);
            if (message == null) {
                continue;
            }
            String sender = message.optString("sender", "Pup Connect");
            String text = message.optString("text", "");
            addMessageBubble(sender, text, "You".equals(sender));
        }
        if (messages.length() == 0) {
            addEmptyRoomHint();
        }
        scrollMessagesToBottom();
    }

    private void addEmptyRoomHint() {
        TextView hint = new TextView(this);
        hint.setText("No messages yet. Messages typed here are stored locally on this device.");
        hint.setTextColor(getColor(R.color.pc_muted));
        hint.setTextSize(12f);
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(dp(18), dp(24), dp(18), dp(24));
        messageList.addView(hint, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    }

    private void addMessageBubble(String sender, String text, boolean mine) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(mine ? Gravity.END : Gravity.START);
        row.setPadding(0, dp(4), 0, dp(4));

        LinearLayout bubble = new LinearLayout(this);
        bubble.setOrientation(LinearLayout.VERTICAL);
        bubble.setPadding(dp(12), dp(8), dp(12), dp(8));
        bubble.setBackgroundResource(R.drawable.card_background);

        TextView senderView = new TextView(this);
        senderView.setText(sender);
        senderView.setTextColor(getColor(R.color.pc_cyan));
        senderView.setTextSize(9f);
        senderView.setTypeface(Typeface.DEFAULT, Typeface.BOLD);

        TextView textView = new TextView(this);
        textView.setText(text);
        textView.setTextColor(getColor(R.color.pc_text));
        textView.setTextSize(14f);
        textView.setPadding(0, dp(2), 0, 0);

        bubble.addView(senderView);
        bubble.addView(textView);

        LinearLayout.LayoutParams bubbleParams = new LinearLayout.LayoutParams(
                (int) (getResources().getDisplayMetrics().widthPixels * 0.78f),
                ViewGroup.LayoutParams.WRAP_CONTENT);
        row.addView(bubble, bubbleParams);
        messageList.addView(row, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    }

    private void scrollMessagesToBottom() {
        messageScroll.post(() -> messageScroll.fullScroll(View.FOCUS_DOWN));
    }

    private void updateRecentRoomUi() {
        String code = prefs.getString(PREF_LAST_ROOM, "");
        String mode = prefs.getString(PREF_LAST_ROOM_MODE, "Local");
        if (code == null || code.isEmpty()) {
            recentRoomTitle.setText("No recent rooms");
            recentRoomSubtitle.setText("Create or join a room to begin.");
            recentRoomBadge.setText("LOCAL");
        } else {
            recentRoomTitle.setText("Room " + code);
            recentRoomSubtitle.setText(mode + " • Tap to reopen locally");
            recentRoomBadge.setText(mode == null ? "LOCAL" : mode.toUpperCase(Locale.US));
        }
    }

    private void shareActiveRoom() {
        if (activeRoomCode == null) {
            Toast.makeText(this, "No active room", Toast.LENGTH_SHORT).show();
            return;
        }
        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType("text/plain");
        intent.putExtra(Intent.EXTRA_TEXT, "Join my Pup Connect room: " + activeRoomCode);
        startActivity(Intent.createChooser(intent, "Share room code"));
    }

    private void copyCurrentContext() {
        String text = activeRoomCode == null ? "Pup Connect • No active room" : activeRoomCode;
        ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        clipboard.setPrimaryClip(ClipData.newPlainText("Pup Connect room", text));
        Toast.makeText(this, activeRoomCode == null ? "Status copied" : "Room code copied", Toast.LENGTH_SHORT).show();
    }

    private void runConnectionCheck() {
        if (!isNetworkAvailable()) {
            showErrorState();
            return;
        }
        liveStatusBadge.setText("Check");
        connectionDetail.setText(activeRoomCode == null ? "Network available • No active room" : "Room " + activeRoomCode + " • Network available");
        handler.postDelayed(() -> {
            liveStatusBadge.setText(activeRoomCode == null ? "Local" : "Room");
            Toast.makeText(this, "Network path available", Toast.LENGTH_SHORT).show();
        }, 450);
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) {
            return false;
        }
        Network network = manager.getActiveNetwork();
        if (network == null) {
            return false;
        }
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
        return capabilities != null && (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
                || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
                || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN));
    }

    private void showErrorState() {
        statusOverlay.setAlpha(1f);
        statusOverlay.setVisibility(View.VISIBLE);
        startupStateContainer.setVisibility(View.GONE);
        errorStateContainer.setVisibility(View.VISIBLE);
    }

    private void retryFromErrorState() {
        if (isNetworkAvailable()) {
            continueLocally();
            Toast.makeText(this, "Network available", Toast.LENGTH_SHORT).show();
        } else {
            Toast.makeText(this, "Still offline", Toast.LENGTH_SHORT).show();
        }
    }

    private void continueLocally() {
        statusOverlay.setVisibility(View.GONE);
        startupStateContainer.setVisibility(View.VISIBLE);
        errorStateContainer.setVisibility(View.GONE);
        showBanner("Local mode • Network features unavailable");
    }

    private void startVoiceControls() {
        if (!requireRoomForCall()) {
            return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_VOICE);
            return;
        }
        activateVoiceUi();
    }

    private void startVideoControls() {
        if (!requireRoomForCall()) {
            return;
        }
        boolean audioGranted = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        boolean cameraGranted = checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
        if (!audioGranted || !cameraGranted) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA}, REQUEST_VIDEO);
            return;
        }
        activateVideoUi();
    }

    private boolean requireRoomForCall() {
        if (activeRoomCode != null) {
            return true;
        }
        Toast.makeText(this, "Create or open a room first", Toast.LENGTH_SHORT).show();
        showRoomActions();
        return false;
    }

    private void activateVoiceUi() {
        callStateText.setText("Voice controls ready • Room " + activeRoomCode + "\nMicrophone permission granted. Peer media transport still requires the WebRTC signaling layer.");
        liveStatusBadge.setText("Call");
    }

    private void activateVideoUi() {
        callStateText.setText("Video controls ready • Room " + activeRoomCode + "\nMicrophone and camera permissions granted. Peer media transport still requires the WebRTC signaling layer.");
        liveStatusBadge.setText("Call");
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        boolean allGranted = grantResults.length > 0;
        for (int result : grantResults) {
            allGranted &= result == PackageManager.PERMISSION_GRANTED;
        }
        if (!allGranted) {
            Toast.makeText(this, "Permission was not granted", Toast.LENGTH_SHORT).show();
            return;
        }
        if (requestCode == REQUEST_VOICE) {
            activateVoiceUi();
        } else if (requestCode == REQUEST_VIDEO) {
            activateVideoUi();
        }
    }

    private void markAlertsRead() {
        notificationBadge.setVisibility(View.GONE);
        setupNoticeCard.setVisibility(View.GONE);
        Toast.makeText(this, "Alerts marked read", Toast.LENGTH_SHORT).show();
    }

    private void showEditIdentityDialog() {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setText(prefs.getString(PREF_NAME, "Local_Pup"));
        input.setSelectAllOnFocus(true);
        input.setTextColor(getColor(R.color.pc_text));
        input.setHintTextColor(getColor(R.color.pc_hint));

        LinearLayout wrapper = new LinearLayout(this);
        wrapper.setPadding(dp(20), dp(4), dp(20), 0);
        wrapper.addView(input, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        new AlertDialog.Builder(this)
                .setTitle("Pup Connect identity")
                .setMessage("This display name is stored only on this device.")
                .setView(wrapper)
                .setPositiveButton("Save", (dialog, which) -> {
                    String name = input.getText().toString().trim();
                    if (name.isEmpty()) {
                        name = "Local_Pup";
                    }
                    prefs.edit().putString(PREF_NAME, name).apply();
                    updateIdentityUi();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void updateIdentityUi() {
        String name = prefs.getString(PREF_NAME, "Local_Pup");
        profileNameText.setText(name);
        drawerIdentityText.setText(name);
    }

    private void showConnectionDialog() {
        String room = activeRoomCode == null ? "None" : activeRoomCode;
        String network = isNetworkAvailable() ? "Available" : "Offline";
        new AlertDialog.Builder(this)
                .setTitle("Connection status")
                .setMessage("Network: " + network
                        + "\nActive room: " + room
                        + "\nMessage storage: Local device"
                        + "\nPeer signaling: Not linked yet"
                        + "\nTarget transport: WebRTC")
                .setPositiveButton("Run check", (dialog, which) -> runConnectionCheck())
                .setNegativeButton("Close", null)
                .show();
    }

    private void showSecurityDialog() {
        new AlertDialog.Builder(this)
                .setTitle("Privacy & security")
                .setMessage("• Identity is stored locally\n• Room messages in this prototype are stored on this device\n• Microphone and camera are requested only when starting calls\n• No TURN credentials are embedded\n• No cloud chat sync is enabled")
                .setPositiveButton("OK", null)
                .show();
    }

    private void showMediaDialog() {
        new AlertDialog.Builder(this)
                .setTitle("Audio & video")
                .setMessage("Voice requests microphone permission. Video requests microphone and camera permission. Pup Connect does not start either permission during normal chat use.")
                .setPositiveButton("OK", null)
                .show();
    }

    private void showDiagnosticsDialog() {
        new AlertDialog.Builder(this)
                .setTitle("Diagnostics")
                .setMessage("Pup Connect 0.1.0-alpha\nPackage: com.harleytg.pupconnect\nUI shell: HCF dev layout model\nMinimum Android: API 26\nTarget: API 35\nNetwork available: " + isNetworkAvailable() + "\nActive room: " + (activeRoomCode == null ? "none" : activeRoomCode))
                .setPositiveButton("OK", null)
                .show();
    }

    private void openSupportEmail() {
        Intent intent = new Intent(Intent.ACTION_SENDTO);
        intent.setData(Uri.parse("mailto:harleytg.hq@gmail.com"));
        intent.putExtra(Intent.EXTRA_SUBJECT, "Pup Connect Support");
        try {
            startActivity(intent);
        } catch (Exception ignored) {
            Toast.makeText(this, "No email app is available", Toast.LENGTH_SHORT).show();
        }
    }

    private void showBanner(String text) {
        welcomeBanner.setText(text);
        welcomeBanner.setVisibility(View.VISIBLE);
        handler.removeCallbacks(hideBannerRunnable);
        handler.postDelayed(hideBannerRunnable, 3200);
    }

    private final Runnable hideBannerRunnable = () -> welcomeBanner.setVisibility(View.GONE);

    private void navigateBackInsideApp() {
        if (roomPanel.getVisibility() == View.VISIBLE) {
            leaveRoomView();
            return;
        }
        if (currentScreen != Screen.CHATS) {
            selectScreen(Screen.CHATS);
            return;
        }
        Toast.makeText(this, "Already at Chats", Toast.LENGTH_SHORT).show();
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
        if (statusOverlay != null && statusOverlay.getVisibility() == View.VISIBLE && errorStateContainer.getVisibility() == View.VISIBLE) {
            continueLocally();
            return;
        }
        if (roomPanel != null && roomPanel.getVisibility() == View.VISIBLE) {
            leaveRoomView();
            return;
        }
        if (currentScreen != Screen.CHATS) {
            selectScreen(Screen.CHATS);
            return;
        }
        super.onBackPressed();
    }

    private enum Screen {
        CHATS,
        CALLS,
        ALERTS,
        ME,
        SETTINGS
    }
}
