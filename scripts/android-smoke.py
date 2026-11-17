"""Real adb/UI smoke against the bundled beta; no simulated networking."""
import pathlib, subprocess, time, xml.etree.ElementTree as ET
out = pathlib.Path('android-smoke'); out.mkdir(exist_ok=True)
def adb(*args):
    return subprocess.check_output(['adb', *args])
def snapshot(label):
    adb('shell','uiautomator','dump','/sdcard/pup-window.xml')
    raw=adb('shell','cat','/sdcard/pup-window.xml')
    (out/f'{label}.xml').write_bytes(raw)
    (out/f'{label}.png').write_bytes(adb('exec-out','screencap','-p'))
    return ET.fromstring(raw)
def tap_label(label):
    root=snapshot('before-'+label.lower())
    node=next(n for n in root.iter('node') if n.get('content-desc')==label)
    import re
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
print('Beta install, launch, navigation, rotation, theme and foreground smoke passed.')
