global.IS_REACT_ACT_ENVIRONMENT=true;
const mockStore=new Map();
jest.mock('react-native-safe-area-context',()=>require('react-native-safe-area-context/jest/mock').default);
jest.mock('react-native-svg',()=>{const React=require('react');const {View}=require('react-native');return {__esModule:true,default:View,Path:View};});
jest.mock('react-native-qrcode-svg',()=>require('react-native').View);
jest.mock('@react-native-community/netinfo',()=>({__esModule:true,default:{addEventListener:()=>()=>{}}}));
jest.mock('react-native-webrtc',()=>({RTCView:require('react-native').View,mediaDevices:{getUserMedia:jest.fn()},RTCPeerConnection:jest.fn()}));
jest.mock('../src/core/native',()=>({native:{version:'0.2.0-beta.1',build:2,inviteHost:'',randomId:()=>require('crypto').randomUUID(),randomSecret:()=>require('crypto').randomBytes(32).toString('hex'),hiveStart:jest.fn(),hiveStop:jest.fn(),importLegacy:jest.fn(async()=>{}),copy:jest.fn(),scan:jest.fn(),startCall:jest.fn(async()=>{}),callConnected:jest.fn(),stopCall:jest.fn(),clearNotifications:jest.fn(),notifyEvent:jest.fn(),route:jest.fn(async()=>{})},vault:{get:jest.fn(async key=>mockStore.get(key)??null),set:jest.fn(async(key,value)=>{mockStore.set(key,JSON.parse(JSON.stringify(value)));}),all:jest.fn(async prefix=>[...mockStore].filter(([key])=>key.startsWith(prefix)).map(([,v])=>v)),remove:jest.fn(async prefix=>{for(const key of mockStore.keys())if(key.startsWith(prefix))mockStore.delete(key);})},reset:()=>mockStore.clear()}));

jest.mock('react-native-bare-kit',()=>({Worklet:{update:jest.fn()}}));
jest.mock('../hive/generated',()=>({__esModule:true,default:{start:jest.fn(async()=>{
  const {EventEmitter}=require('events'); const ipc=new EventEmitter(); ipc.destroyed=false;
  ipc.write=jest.fn(); ipc.terminate=jest.fn(async()=>{ipc.destroyed=true;return 0});return {ipc};
})}}));
