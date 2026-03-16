import { execSync } from 'child_process';

type Platform = 'macos' | 'windows' | 'linux';
type Button = 'left' | 'right' | 'middle';
type ScrollDirection = 'up' | 'down';
type ModifierKey = 'shift' | 'ctrl' | 'alt' | 'command' | 'meta';

interface Options {
  dryRun?: boolean;
}

interface AppInfo {
  name: string;
  pid: number;
}

interface WindowInfo {
  title: string;
  app: string;
  bounds: { x: number; y: number; width: number; height: number };
}

const LOG_PREFIX = '[DesktopControl]';
const EXEC_TIMEOUT = 5000;

// ── Input sanitisation ─────────────────────────────────────────────────────
// Only allow safe characters in app names / key names to prevent shell injection.
// Note: forward-slash and dot are excluded to prevent path traversal attacks.
const SAFE_APP_NAME = /^[a-zA-Z0-9 _\-()]+$/;

function assertSafeAppName(name: string): void {
  if (!name || name.length > 256 || !SAFE_APP_NAME.test(name)) {
    throw new Error(`Unsafe app name rejected: "${name.slice(0, 40)}"`)
  }
}

function assertSafeKeyName(key: string): void {
  // Key names should be short identifiers (e.g. "Return", "arrowup", "a")
  if (!key || key.length > 64 || !/^[a-zA-Z0-9_ +\-]+$/.test(key)) {
    throw new Error(`Unsafe key name rejected: "${key.slice(0, 40)}"`)
  }
}

function getPlatform(): Platform {
  const plat = process.platform;
  if (plat === 'darwin') return 'macos';
  if (plat === 'win32') return 'windows';
  if (plat === 'linux') return 'linux';
  throw new Error(`Unsupported platform: ${plat}`);
}

function exec(cmd: string): string {
  try {
    return execSync(cmd, { timeout: EXEC_TIMEOUT, encoding: 'utf-8' }).trim();
  } catch (err: any) {
    throw new Error(`Command failed: ${cmd}\n${err.message}`);
  }
}

// Shell-safe string escaping for osascript (wrap in single quotes, escape internal quotes)
function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// Validate mouse coordinates are within reasonable bounds
function assertValidCoords(x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 10000 || y > 10000) {
    throw new Error(`Invalid mouse coordinates: (${x}, ${y})`);
  }
}

function log(msg: string): void {
  console.log(`${LOG_PREFIX} ${msg}`);
}

// ============================================================================
// MOUSE CONTROL
// ============================================================================

function mouseMove(x: number, y: number, opts?: Options): string {
  assertValidCoords(x, y);
  const msg = `Moving mouse to (${x}, ${y})`;
  if (opts?.dryRun) {
    log(`[DRY RUN] ${msg}`);
    return msg;
  }

  const plat = getPlatform();
  try {
    if (plat === 'macos') {
      const script = `tell application "System Events" to move mouse to (${Math.round(x)}, ${Math.round(y)})`;
      exec(`osascript -e ${escapeShellArg(script)}`);
    } else if (plat === 'windows') {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})`;
      exec(`powershell -NoProfile -Command "${ps}"`);
    } else {
      exec(`xdotool mousemove ${x} ${y}`);
    }
    log(msg);
    return msg;
  } catch (err: any) {
    log(`ERROR: Failed to move mouse - ${err.message}`);
    throw err;
  }
}

function mouseClick(
  x: number,
  y: number,
  button: Button = 'left',
  opts?: Options
): string {
  assertValidCoords(x, y);
  const msg = `Clicking ${button} mouse button at (${x}, ${y})`;
  if (opts?.dryRun) {
    log(`[DRY RUN] ${msg}`);
    return msg;
  }

  mouseMove(x, y);
  const plat = getPlatform();

  try {
    if (plat === 'macos') {
      const btnNum = button === 'left' ? 0 : button === 'right' ? 1 : 2;
      const script = `tell application "System Events" to click mouse button ${btnNum + 1}`;
      exec(`osascript -e ${escapeShellArg(script)}`);
    } else if (plat === 'windows') {
      // Use mouse_event via P/Invoke for proper button support
      const btnDown = button === 'right' ? '0x0008' : button === 'middle' ? '0x0020' : '0x0002';
      const btnUp   = button === 'right' ? '0x0010' : button === 'middle' ? '0x0040' : '0x0004';
      const ps = `
Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int f,int x,int y,int d,int e);' -Name U -Namespace W;
[W.U]::mouse_event(${btnDown},0,0,0,0);[W.U]::mouse_event(${btnUp},0,0,0,0)`;
      exec(`powershell -NoProfile -Command "${ps}"`);
    } else {
      const btnName = button === 'left' ? 1 : button === 'right' ? 3 : 2;
      exec(`xdotool click ${btnName}`);
    }
    log(msg);
    return msg;
  } catch (err: any) {
    log(`ERROR: Failed to click - ${err.message}`);
    throw err;
  }
}

function mouseDoubleClick(x: number, y: number, opts?: Options): string {
  assertValidCoords(x, y);
  const msg = `Double-clicking at (${x}, ${y})`;
  if (opts?.dryRun) {
    log(`[DRY RUN] ${msg}`);
    return msg;
  }

  mouseMove(x, y);
  const plat = getPlatform();

  try {
    if (plat === 'macos') {
      const script = `tell application "System Events" to double click at (${x}, ${y})`;
      exec(`osascript -e ${escapeShellArg(script)}`);
    } else if (plat === 'windows') {
      // Use mouse_event P/Invoke for reliable double-click (SendKeys has no LBUTTON token)
      const ps = `
Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int f,int x,int y,int d,int e);' -Name U -Namespace W;
[W.U]::mouse_event(0x0002,0,0,0,0);[W.U]::mouse_event(0x0004,0,0,0,0);
Start-Sleep -Milliseconds 50;
[W.U]::mouse_event(0x0002,0,0,0,0);[W.U]::mouse_event(0x0004,0,0,0,0)`;
      exec(`powershell -NoProfile -Command "${ps}"`);
    } else {
      exec(`xdotool click 1 click 1`);
    }
    log(msg);
    return msg;
  } catch (err: any) {
    log(`ERROR: Failed to double-click - ${err.message}`);
    throw err;
  }
}

function mouseScroll(
  x: number,
  y: number,
  direction: ScrollDirection,
  amount: number = 5,
  opts?: Options
): string {
  assertValidCoords(x, y);
  const msg = `Scrolling ${direction} by ${amount} at (${x}, ${y})`;
  if (opts?.dryRun) {
    log(`[DRY RUN] ${msg}`);
    return msg;
  }

  mouseMove(x, y);
  const plat = getPlatform();

  try {
    if (plat === 'macos') {
      const delta = direction === 'up' ? amount : -amount;
      const script = `tell application "System Events" to scroll down by ${delta}`;
      exec(`osascript -e ${escapeShellArg(script)}`);
    } else if (plat === 'windows') {
      // Use mouse_event with MOUSEEVENTF_WHEEL (0x0800); positive delta = scroll up
      const wheelDelta = direction === 'up' ? 120 * amount : -120 * amount;
      const ps = `
Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int f,int x,int y,int d,int e);' -Name U -Namespace W;
[W.U]::mouse_event(0x0800,0,0,${wheelDelta},0)`;
      exec(`powershell -NoProfile -Command "${ps}"`);
    } else {
      const btn = direction === 'up' ? 4 : 5;
      for (let i = 0; i < amount; i++) {
        exec(`xdotool click ${btn}`);
      }
    }
    log(msg);
    return msg;
  } catch (err: any) {
    log(`ERROR: Failed to scroll - ${err.message}`);
    throw err;
  }
}

function mouseDrag(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  opts?: Options
): string {
  assertValidCoords(fromX, fromY);
  assertValidCoords(toX, toY);
  const msg = `Dragging from (${fromX}, ${fromY}) to (${toX}, ${toY})`;
  if (opts?.dryRun) {
    log(`[DRY RUN] ${msg}`);
    return msg;
  }

  const plat = getPlatform();

  try {
    if (plat === 'macos') {
      const script = `tell application "System Events"
        mouse down at (${fromX}, ${fromY})
        move mouse to (${toX}, ${toY})
        mouse up
      end tell`;
      exec(`osascript -e ${escapeShellArg(script)}`);
    } else if (plat === 'windows') {
      // Use mouse_event P/Invoke for reliable drag (SendKeys has no LBUTTON_DOWN/UP tokens)
      const ps = `
Add-Type -AssemblyName System.Windows.Forms;
Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int f,int x,int y,int d,int e);' -Name U -Namespace W;
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${fromX}, ${fromY});
[W.U]::mouse_event(0x0002,0,0,0,0);
Start-Sleep -Milliseconds 50;
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${toX}, ${toY});
Start-Sleep -Milliseconds 50;
[W.U]::mouse_event(0x0004,0,0,0,0)`;
      exec(`powershell -NoProfile -Command "${ps}"`);
    } else {
      exec(`xdotool mousemove ${fromX} ${fromY} mousedown 1 mousemove ${toX} ${toY} mouseup 1`);
    }
    log(msg);
    return msg;
  } catch (err: any) {
    log(`ERROR: Failed to drag - ${err.message}`);
    throw err;
  }
}

// ============================================================================
// KEYBOARD CONTROL
// ============================================================================

function typeText(text: string, opts?: Options): string {
  const msg = `Typing text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`;
  if (opts?.dryRun) {
    log(`[DRY RUN] ${msg}`);
    return msg;
  }

  const plat = getPlatform();

  try {
    if (plat === 'macos') {
      const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      exec(`osascript -e ${escapeShellArg(`tell application "System Events" to keystroke "${escaped}"`)}`);

    } else if (plat === 'windows') {
      const escaped = text.replace(/"/g, '""');
      const ps = `[System.Windows.Forms.SendKeys]::SendWait("${escaped}")`;
      exec(`powershell -NoProfile -Command "${ps}"`);
    } else {
      const escaped = text.replace(/'/g, "'\\''");
      exec(`xdotool type '${escaped}'`);
    }
    log(msg);
    return msg;
  } catch (err: any) {
    log(`ERROR: Failed to type text - ${err.message}`);
    throw err;
  }
}

function pressKey(key: string, opts?: Options): string {
  assertSafeKeyName(key);
  const msg = `Pressing key: ${key}`;
  if (opts?.dryRun) {
    log(`[DRY RUN] ${msg}`);
    return msg;
  }

  const plat = getPlatform();

  try {
    if (plat === 'macos') {
      const keyMap: { [k: string]: string } = {
        return: 'return',
        enter: 'return',
        escape: 'escape',
        tab: 'tab',
        space: 'space',
        backspace: 'delete',
        delete: 'delete',
        home: 'home',
        end: 'end',
        pageup: 'page up',
        pagedown: 'page down',
        arrowup: 'up arrow',
        arrowdown: 'down arrow',
        arrowleft: 'left arrow',
        arrowright: 'right arrow',
      };
      const osKey = keyMap[key.toLowerCase()] || key;
      exec(`osascript -e ${escapeShellArg(`tell application "System Events" to key code for "${osKey}"`)}`);

    } else if (plat === 'windows') {
      const keyMap: { [k: string]: string } = {
        return: 'RETURN',
        enter: 'RETURN',
        escape: 'ESCAPE',
        tab: 'TAB',
        space: 'SPACE',
        backspace: 'BACKSPACE',
        delete: 'DELETE',
        home: 'HOME',
        end: 'END',
        pageup: 'PAGEUP',
        pagedown: 'PAGEDOWN',
        arrowup: 'UP',
        arrowdown: 'DOWN',
        arrowleft: 'LEFT',
        arrowright: 'RIGHT',
      };
      const psKey = keyMap[key.toLowerCase()] || key.toUpperCase();
      const ps = `[System.Windows.Forms.SendKeys]::SendWait('{${psKey}}')`;
      exec(`powershell -NoProfile -Command "${ps}"`);
    } else {
      const xdotoolMap: { [k: string]: string } = {
        return: 'Return',
        enter: 'Return',
        escape: 'Escape',
        tab: 'Tab',
        space: 'space',
        backspace: 'BackSpace',
        delete: 'Delete',
      };
      const xdtKey = xdotoolMap[key.toLowerCase()] || key;
      exec(`xdotool key ${xdtKey}`);
    }
    log(msg);
    return msg;
  } catch (err: any) {
    log(`ERROR: Failed to press key - ${err.message}`);
    throw err;
  }
}

function hotkey(modifiers: ModifierKey[], key: string, opts?: Options): string {
  assertSafeKeyName(key);
  for (const m of modifiers) assertSafeKeyName(m);
  const msg = `Hotkey: ${modifiers.join('+').toUpperCase()} + ${key}`;
  if (opts?.dryRun) {
    log(`[DRY RUN] ${msg}`);
    return msg;
  }

  const plat = getPlatform();

  try {
    if (plat === 'macos') {
      const modMap: { [k: string]: string } = {
        shift: 'shift down',
        ctrl: 'control down',
        alt: 'option down',
        command: 'command down',
        meta: 'command down',
      };
      const modStrs = modifiers.map((m) => modMap[m.toLowerCase()] || m);
      const script = `tell application "System Events"
        ${modStrs.join('\n        ')}
        key code for "${key}"
        ${modifiers.map((m) => (m === 'command' || m === 'meta' ? 'command up' : m === 'alt' ? 'option up' : m === 'ctrl' ? 'control up' : 'shift up')).join('\n        ')}
      end tell`;
      exec(`osascript -e ${escapeShellArg(script)}`);
    } else if (plat === 'windows') {
      const modMap: { [k: string]: string } = {
        shift: '+',
        ctrl: '^',
        alt: '%',
        command: '^',
        meta: '^',
      };
      const modStr = modifiers.map((m) => modMap[m.toLowerCase()] || '').join('');
      const ps = `[System.Windows.Forms.SendKeys]::SendWait("${modStr}{${key.toUpperCase()}}")`;
      exec(`powershell -NoProfile -Command "${ps}"`);
    } else {
      const modStr = modifiers.join('+').toLowerCase() + (modifiers.length > 0 ? '+' : '');
      exec(`xdotool key ${modStr}${key}`);
    }
    log(msg);
    return msg;
  } catch (err: any) {
    log(`ERROR: Failed to send hotkey - ${err.message}`);
    throw err;
  }
}

// ============================================================================
// APP CONTROL
// ============================================================================

function launchApp(appName: string, opts?: Options): string {
  assertSafeAppName(appName);
  const msg = `Launching app: ${appName}`;
  if (opts?.dryRun) {
    log(`[DRY RUN] ${msg}`);
    return msg;
  }

  const plat = getPlatform();

  try {
    if (plat === 'macos') {
      exec(`open -a "${appName}"`);
    } else if (plat === 'windows') {
      const ps = `Start-Process "${appName}"`;
      exec(`powershell -NoProfile -Command "${ps}"`);
    } else {
      exec(`nohup "${appName}" &`);
    }
    log(msg);
    return msg;
  } catch (err: any) {
    log(`ERROR: Failed to launch app - ${err.message}`);
    throw err;
  }
}

function listRunningApps(): AppInfo[] {
  const plat = getPlatform();

  try {
    if (plat === 'macos') {
      const result = exec(
        `osascript -e 'tell application "System Events" to get name of (processes where background only is false)'`
      );
      const apps = result.split(', ');
      return apps.map((name, i) => ({ name: name.trim(), pid: i }));
    } else if (plat === 'windows') {
      const ps = `Get-Process | Select-Object -Property Name, Id | ConvertTo-Json`;
      const result = exec(`powershell -NoProfile -Command "${ps}"`);
      const procs = JSON.parse(result);
      return Array.isArray(procs)
        ? procs.map((p: any) => ({ name: p.Name, pid: p.Id }))
        : [{ name: procs.Name, pid: procs.Id }];
    } else {
      const result = exec(`ps aux | awk '{print $1, $2, $11}' | tail -n +2`);
      const lines = result.split('\n');
      return lines
        .map((line) => {
          const parts = line.trim().split(/\s+/);
          return { name: parts[2] || 'unknown', pid: parseInt(parts[1], 10) };
        })
        .filter((p) => !isNaN(p.pid));
    }
  } catch (err: any) {
    log(`ERROR: Failed to list apps - ${err.message}`);
    return [];
  }
}

function focusApp(appName: string, opts?: Options): string {
  assertSafeAppName(appName);
  const msg = `Focusing app: ${appName}`;
  if (opts?.dryRun) {
    log(`[DRY RUN] ${msg}`);
    return msg;
  }

  const plat = getPlatform();

  try {
    if (plat === 'macos') {
      exec(`osascript -e ${escapeShellArg(`activate application "${appName}"`)}`);

    } else if (plat === 'windows') {
      const ps = `(Get-Process -Name "${appName}" -ErrorAction SilentlyContinue | Select-Object -First 1).MainWindowHandle`;
      exec(`powershell -NoProfile -Command "${ps}"`);
    } else {
      exec(`wmctrl -a "${appName}"`);
    }
    log(msg);
    return msg;
  } catch (err: any) {
    log(`ERROR: Failed to focus app - ${err.message}`);
    throw err;
  }
}

function getActiveWindow(): WindowInfo | null {
  const plat = getPlatform();

  try {
    if (plat === 'macos') {
      const script = `
        tell application "System Events"
          set frontApp to name of first application process whose frontmost is true
          tell process frontApp
            set winTitle to name of front window
            set winBounds to bounds of front window
          end tell
          return {app:frontApp, title:winTitle, bounds:winBounds}
        end tell
      `;
      const result = exec(`osascript -e ${escapeShellArg(script)}`);
      const match = result.match(/app:(.+?),\s*title:(.+?),\s*bounds:([\d, ]+)/);
      if (match) {
        const bounds = match[3].split(', ').map(Number);
        return {
          app: match[1].trim(),
          title: match[2].trim(),
          bounds: { x: bounds[0], y: bounds[1], width: bounds[2] - bounds[0], height: bounds[3] - bounds[1] },
        };
      }
    } else if (plat === 'windows') {
      const ps = `
        Add-Type -AssemblyName System.Windows.Forms;
        $handle = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;
        Get-Process | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object -First 1 ProcessName
      `;
      const result = exec(`powershell -NoProfile -Command "${ps}"`);
      return {
        app: result.trim(),
        title: 'Unknown',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      };
    } else {
      const result = exec(`xdotool getactivewindow getwindowname`);
      const lines = result.split('\n');
      return {
        app: 'Unknown',
        title: lines[1] || 'Unknown',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      };
    }
    return null;
  } catch (err: any) {
    log(`ERROR: Failed to get active window - ${err.message}`);
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  getPlatform,
  mouseMove,
  mouseClick,
  mouseDoubleClick,
  mouseScroll,
  mouseDrag,
  typeText,
  pressKey,
  hotkey,
  launchApp,
  listRunningApps,
  focusApp,
  getActiveWindow,
  type Options,
  type Button,
  type ScrollDirection,
  type ModifierKey,
  type AppInfo,
  type WindowInfo,
};