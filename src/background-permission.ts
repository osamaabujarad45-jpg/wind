/** Called only from a driver action after explaining why background access is optional. */
export async function requestBackgroundTracking(io:{foreground:()=>Promise<boolean>;current:()=>Promise<{granted:boolean}>;
  request:()=>Promise<{granted:boolean}>;provider:()=>Promise<{locationServicesEnabled:boolean;backgroundModeEnabled:boolean}>}) {
  if(!await io.foreground())return false;
  const existing=await io.current(),permission=existing.granted?existing:await io.request();
  if(!permission.granted)return false;
  const status=await io.provider();
  return status.locationServicesEnabled && status.backgroundModeEnabled;
}
