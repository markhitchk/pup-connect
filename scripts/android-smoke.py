"""Real adb/UI smoke against the bundled beta; no simulated networking."""
import pathlib, re, subprocess, time, xml.etree.ElementTree as ET
out = pathlib.Path('android-smoke'); out.mkdir(exist_ok=True)
def adb(*args):
    return subprocess.check_output(['adb', *args], timeout=90)
def snapshot(label):
    adb('shell','uiautomator','dump','/sdcard/pup-window.xml')
    raw=adb('shell','cat','/sdcard/pup-window.xml')
    (out/f'{label}.xml').write_bytes(raw)
    (out/f'{label}.png').write_bytes(adb('exec-out','screencap','-p'))
    root = ET.fromstring(raw)
    assert not any(n.get('content-desc') == 'Dismiss status' for n in root.iter('node')), f'Unexpected app error in {label}; inspect XML/screenshot'
    return root
def tap_label(label):
    root=snapshot('before-'+label.lower())
    for attempt in range(6):
        # Android exposes clipped/off-screen descendants, sometimes with y2 < y1.
        # A label alone is not evidence of a tappable target.
        def visible(n):
            x1,y1,x2,y2=map(int,re.findall(r'-?\d+',n.get('bounds')))
            return x2-x1 >= 24 and y2-y1 >= 24
        node=next((n for n in root.iter('node') if (n.get('content-desc')==label or (n.get('text','').casefold()==label.casefold() and n.get('clickable')=='true')) and visible(n)), None)
        if node is not None: break
        scroll=next(n for n in root.iter('node') if n.get('class')=='android.widget.ScrollView')
        x1,y1,x2,y2=map(int,re.findall(r'-?\d+',scroll.get('bounds')))
        clipped=next((n for n in root.iter('node') if n.get('content-desc')==label),None)
        above=False
        if clipped is not None:
            bx1,by1,bx2,by2=map(int,re.findall(r'-?\d+',clipped.get('bounds')))
            above=by2 <= y1
        start,end=(y1+50,y2-50) if above else (y2-50,y1+50)
        adb('shell','input','swipe',str((x1+x2)//2),str(start),str((x1+x2)//2),str(end),'250')
        time.sleep(1)
        root=snapshot('scroll-'+label.lower()+str(attempt))
    assert node is not None, label
    x1,y1,x2,y2=map(int,re.findall(r'-?\d+',node.get('bounds')))
    adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
    time.sleep(1)
    return snapshot(label.lower())
adb('install','-r','android/app/build/outputs/apk/beta/app-beta.apk')
adb('logcat','-c')
adb('shell','am','start','-W','com.harleytg.pupconnect/.MainActivity')
for _ in range(30):
    time.sleep(1)
    root=snapshot('launch')
    if any(n.get('text')=='No recent rooms' for n in root.iter('node')): break
else: raise AssertionError('Bundled app did not reach Chats')
for label,expected in [('Calls','RECENT CALLS'),('Pack','Your room, your pack'),('Settings','App Settings'),('Chats','No recent rooms')]:
    root=tap_label(label)
    assert any(n.get('text')==expected for n in root.iter('node')), (label,expected)
# Exercise real Android Keystore encryption and SQLite decryption across process death.
tap_label('Settings')
root = tap_label('Display name')
field = next(n for n in root.iter('node') if n.get('content-desc') == 'Display name')
adb('shell','input','keyevent','KEYCODE_MOVE_END')
if field.get('text'):
    adb('shell','input','keyevent',*(['KEYCODE_DEL'] * len(field.get('text'))))
time.sleep(0.5)
adb('shell','input','text','Smoke_Pup')
time.sleep(0.5)
adb('shell','input','keyevent','KEYCODE_BACK')
edited=snapshot('edited-display-name')
expected_name=next(n.get('text') for n in edited.iter('node') if n.get('content-desc')=='Display name').strip()
assert expected_name and expected_name != field.get('text'), 'Display name was not edited'
tap_label('Save display name')
adb('shell','am','force-stop','com.harleytg.pupconnect')
adb('shell','am','start','-W','com.harleytg.pupconnect/.MainActivity')
for _ in range(20):
    time.sleep(1)
    root = snapshot('encrypted-reload')
    if any(n.get('content-desc') == 'Display name' and n.get('text') == expected_name for n in root.iter('node')):
        break
else: raise AssertionError('Encrypted display name and navigation did not survive process restart')
# Exercise the real embedded hive worker: no WSS URL, private backend or mocked room event.
tap_label('Pack')
tap_label('Create or join room')
tap_label('Create Room')
for _ in range(30):
    time.sleep(1)
    root=snapshot('hive-room')
    if any(re.fullmatch(r'\d{6}',n.get('text','')) for n in root.iter('node')):break
else:raise AssertionError('Embedded hive worker did not create a real local room')
tap_label('Pack')
tap_label('Show QR invitation')
snapshot('hive-qr')
tap_label('Close')
tap_label('Close room')
tap_label('Close room')
for _ in range(15):
    time.sleep(1)
    root=snapshot('hive-room-closed')
    if any(n.get('text')=='No active room' for n in root.iter('node')):break
else:raise AssertionError('Hive room did not close after its state was persisted')
tap_label('Chats')
adb('shell','settings','put','system','accelerometer_rotation','0')
adb('shell','settings','put','system','user_rotation','1');time.sleep(2)
root=snapshot('landscape')
assert any(n.get('content-desc')=='Chats' for n in root.iter('node'))
adb('shell','settings','put','system','user_rotation','0')
adb('shell','cmd','uimode','night','yes');time.sleep(2)
snapshot('dark')
adb('shell','cmd','uimode','night','no');time.sleep(2)
snapshot('light')
adb('shell','input','keyevent','KEYCODE_HOME');time.sleep(1)
adb('shell','am','start','-W','com.harleytg.pupconnect/.MainActivity');time.sleep(2)
snapshot('foreground')
assert adb('shell','pidof','com.harleytg.pupconnect').strip()
logs=adb('logcat','-d','-s','AndroidRuntime:E')
(out/'runtime.log').write_bytes(logs)
assert b'FATAL EXCEPTION' not in logs
print('Hive beta install, launch, embedded room create/QR/close, navigation, Keystore/SQLite persistence, rotation, theme and foreground smoke passed.')
