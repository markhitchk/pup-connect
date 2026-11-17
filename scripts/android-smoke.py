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
            x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')))
            return x2-x1 >= 24 and y2-y1 >= 24
        node=next((n for n in root.iter('node') if n.get('content-desc')==label and visible(n)), None)
        if node is not None: break
        scroll=next(n for n in root.iter('node') if n.get('class')=='android.widget.ScrollView')
        x1,y1,x2,y2=map(int,re.findall(r'\d+',scroll.get('bounds')))
        adb('shell','input','swipe',str((x1+x2)//2),str(y2-50),str((x1+x2)//2),str(y1+50),'250')
        time.sleep(1)
        root=snapshot('scroll-'+label.lower()+str(attempt))
    assert node is not None, label
    x1,y1,x2,y2=map(int,re.findall(r'\d+',node.get('bounds')))
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
def fill_label(label,value):
    root=tap_label(label)
    field=next(n for n in root.iter('node') if n.get('content-desc')==label)
    adb('shell','input','keyevent','KEYCODE_MOVE_END')
    if field.get('text'): adb('shell','input','keyevent',*(['KEYCODE_DEL']*len(field.get('text'))))
    time.sleep(0.5)
    if value: adb('shell','input','text',value)
    time.sleep(0.5)
    adb('shell','input','keyevent','KEYCODE_BACK')
fill_label('Signaling URL','wss://example.invalid/ws')
root=tap_label('Save connection')
assert any(n.get('content-desc')=='Signaling URL' and n.get('text')=='wss://example.invalid/ws' for n in root.iter('node')), 'Connection setting was not saved from Settings'
# Exercise custom URI parsing on Android, without substituting a fake room/service.
import shlex
invitation='pupconnect://join?code=123456&invite='+'a'*64
adb('shell','am start -W -a android.intent.action.VIEW -d '+shlex.quote(invitation)+' com.harleytg.pupconnect')
time.sleep(1)
tap_label('Join Room')
tap_label('Cancel connection')
tap_label('Settings')
fill_label('Signaling URL','')
tap_label('Save connection')
tap_label('Chats')
adb('shell','settings','put','system','accelerometer_rotation','0')
adb('shell','settings','put','system','user_rotation','1');time.sleep(2)
root=snapshot('landscape')
assert any(n.get('text')=='No recent rooms' for n in root.iter('node'))
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
print('Beta install, launch, navigation, Keystore/SQLite restart persistence, rotation, theme and foreground smoke passed.')
