"""
Kopírovačka Pro – Premium Clipboard Manager (2026 Edition)
==========================================================
Rebuilt from scratch for maximum performance, aesthetics, and reliability.
Designed for professional users.
"""

import ctypes
import time
import threading
import os
import sys
import tkinter as tk
from tkinter import messagebox
import shutil
import subprocess
from PIL import Image, ImageDraw, ImageFont

# ─── Configuration & Tokens ──────────────────────────────────────────────────
APP_NAME = "Kopírovačka Pro"
VERSION = "3.0.0"
HOTKEY = "ctrl+;"
MAX_HISTORY = 50
MAX_PREVIEW = 350
APPDATA_FOLDER = os.path.join(os.environ["APPDATA"], "KopirovackaPro")
TARGET_EXE = os.path.join(APPDATA_FOLDER, "KopirovackaPro.exe")
TARGET_UNINSTALL = os.path.join(APPDATA_FOLDER, "Uninstall.exe")
MUTEX_NAME = "KopirovackaPro_Global_Mutex_2026"

# Lazy Loading handles
ctk = None
pyperclip = None
keyboard = None
pystray = None

def lazy_load_core():
    global pyperclip, keyboard, pystray
    if pyperclip is None: import pyperclip
    if keyboard is None: import keyboard
    if pystray is None: import pystray

def lazy_load_ui():
    global ctk
    if ctk is None:
        import customtkinter as _ctk
        ctk = _ctk
        ctk.set_appearance_mode("light")
        ctk.set_default_color_theme("blue")

def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

# ─── Splash Screen (Okamžitá spätná väzba) ──────────────────────────────────
class SplashScreen:
    def __init__(self):
        self.root = tk.Tk()
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.configure(bg="#1a365d")
        
        w, h = 400, 150
        sw, sh = self.root.winfo_screenwidth(), self.root.winfo_screenheight()
        self.root.geometry(f"{w}x{h}+{(sw-w)//2}+{(sh-h)//2}")
        
        tk.Label(self.root, text="Kopírovačka Pro", font=("Segoe UI", 24, "bold"), fg="white", bg="#1a365d").pack(pady=(30, 0))
        tk.Label(self.root, text="Spúšťam Elite verziu...", font=("Segoe UI", 12), fg="#a0aec0", bg="#1a365d").pack()
        
        self.root.update()

    def close(self):
        self.root.destroy()

# ─── Pro Installer UI ────────────────────────────────────────────────────────
class ProInstaller:
    def __init__(self):
        lazy_load_ui()
        self.root = ctk.CTk()
        self.root.title(f"Inštalácia {APP_NAME}")
        self.root.geometry("550x420")
        self.root.resizable(False, False)
        self.root.attributes("-topmost", True)
        
        # Center on screen
        sw, sh = self.root.winfo_screenwidth(), self.root.winfo_screenheight()
        self.root.geometry(f"+{(sw-550)//2}+{(sh-420)//2}")
        
        # Icon
        ico = resource_path("kopirovacka_pro.ico")
        if os.path.exists(ico): self.root.iconbitmap(ico)

        self.shortcut_var = tk.BooleanVar(value=True)
        self._show_welcome()

    def _show_welcome(self):
        self._clear()
        
        # Heading with a bit of "Pro" flair
        ctk.CTkLabel(self.root, text=f"Vitajte v {APP_NAME}", font=("Segoe UI", 26, "bold"), text_color="#1a365d").pack(pady=(40, 10))
        ctk.CTkLabel(self.root, text="Tento sprievodca pripraví váš profesionálny manažér schránky.", font=("Segoe UI", 14)).pack(pady=5)
        
        frame = ctk.CTkFrame(self.root, fg_color="transparent")
        frame.pack(pady=30)
        ctk.CTkCheckBox(frame, text="Vytvoriť inteligentný odkaz na ploche", variable=self.shortcut_var, font=("Segoe UI", 13)).pack()

        btn_f = ctk.CTkFrame(self.root, fg_color="transparent")
        btn_f.pack(side="bottom", fill="x", padx=30, pady=30)
        ctk.CTkButton(btn_f, text="Zrušiť", width=120, fg_color="#edf2f7", text_color="#2d3748", hover_color="#e2e8f0", command=self.root.destroy).pack(side="left")
        ctk.CTkButton(btn_f, text="Spustiť inštaláciu", width=150, font=("Segoe UI", 13, "bold"), command=self._install).pack(side="right")

    def _install(self):
        self._clear()
        ctk.CTkLabel(self.root, text="Pripravuje sa 'Pro' prostredie", font=("Segoe UI", 20, "bold")).pack(pady=(60, 20))
        self.pb = ctk.CTkProgressBar(self.root, width=450, height=12)
        self.pb.set(0)
        self.pb.pack(pady=10)
        self.status = ctk.CTkLabel(self.root, text="Inicializujem... 0%", font=("Segoe UI", 12), text_color="#718096")
        self.status.pack()
        
        threading.Thread(target=self._logic, daemon=True).start()

    def _logic(self):
        try:
            # 1. Folders
            if not os.path.exists(APPDATA_FOLDER): os.makedirs(APPDATA_FOLDER)
            self._update(0.3, "Príprava systémových priečinkov... 30%")
            time.sleep(0.3)
            
            # 2. Copying App
            shutil.copy2(sys.executable, TARGET_EXE)
            self._update(0.5, "Inštalácia binárnych súborov... 50%")
            time.sleep(0.3)

            # 3. Handle Uninstaller
            # Skúsime nájsť Uninstall.exe (ak ho PyInstaller pribalil)
            uninst_src = resource_path("Uninstall.exe")
            if os.path.exists(uninst_src):
                shutil.copy2(uninst_src, TARGET_UNINSTALL)
                self._update(0.7, "Príprava odinštalátora... 70%")
            else:
                # Ak sme v dev móde alebo chýba, len preskočíme
                self._update(0.7, "Konfigurácia... 70%")
            time.sleep(0.3)

            # 4. Shortcut
            if self.shortcut_var.get():
                desktop = os.path.join(os.environ["USERPROFILE"], "Desktop")
                path = os.path.join(desktop, f"{APP_NAME}.lnk")
                ps = (
                    f'$WshShell = New-Object -ComObject WScript.Shell; '
                    f'$Shortcut = $WshShell.CreateShortcut(\'{path}\'); '
                    f'$Shortcut.TargetPath = \'{TARGET_EXE}\'; '
                    f'$Shortcut.IconLocation = \'{TARGET_EXE},0\'; '
                    f'$Shortcut.WorkingDirectory = \'{APPDATA_FOLDER}\'; '
                    f'$Shortcut.Save()'
                )
                subprocess.run(["powershell", "-Command", ps], capture_output=True, check=True)
                self._update(0.9, "Generovanie odkazu na ploche... 90%")
            
            self._update(1.0, "Hotovo! 100%")
            self.root.after(300, self._finish_ui)
        except Exception as e:
            self.root.after(0, lambda e=e: messagebox.showerror("Chyba", f"Inštalácia zlyhala:\n{e}"))
            self.root.after(0, self.root.destroy)

    def _update(self, val, txt):
        self.root.after(0, lambda: self.pb.set(val))
        self.root.after(0, lambda: self.status.configure(text=txt))

    def _finish_ui(self):
        self._clear()
        ctk.CTkLabel(self.root, text="Úspešne pripravené! 🚀", font=("Segoe UI", 24, "bold"), text_color="#2f855a").pack(pady=(80, 20))
        ctk.CTkButton(self.root, text="Dokončiť a spustiť Pro", width=200, height=40, font=("Segoe UI", 14, "bold"), command=self._launch).pack(pady=10)

    def _launch(self):
        os.startfile(TARGET_EXE)
        self.root.destroy()
        os._exit(0)

    def _clear(self):
        for w in self.root.winfo_children(): w.destroy()

    def run(self):
        self.root.mainloop()

# ─── Pro Application Logic ──────────────────────────────────────────────────
class KopirovackaPro:
    def __init__(self, root):
        self.root = root
        self.history = []
        self.last_item = ""
        self.lock = threading.Lock()
        self.active = True
        self.popup_visible = False
        self.pinned = False
        self.suppress_monitor = False # Flag na zabránenie duplikácie pri výbere
        
        lazy_load_core()
        
        # Load initial clipboard
        try: self.last_item = pyperclip.paste() or ""
        except: pass

        # Tray & Hotkey
        self.icon = self._setup_tray()
        keyboard.add_hotkey(HOTKEY, lambda: self.root.after(0, self.toggle_dashboard), suppress=False)

        # Background Threads
        threading.Thread(target=self._monitor, daemon=True).start()
        threading.Thread(target=self.icon.run, daemon=True).start()

    def _monitor(self):
        while self.active:
            if self.suppress_monitor:
                time.sleep(0.1)
                continue
                
            try:
                current = pyperclip.paste()
                if current and current != self.last_item:
                    text = current[:50000] if len(current) > 50000 else current
                    with self.lock:
                        if text in self.history:
                            self.history.remove(text)
                        self.history.append(text)
                        
                        if len(self.history) > MAX_HISTORY:
                            self.history.pop(0)
                        self.last_item = text
            except: pass
            time.sleep(0.5)

    def toggle_dashboard(self):
        if self.popup_visible: return
        if not self.history:
            self.root.after(0, lambda: messagebox.showinfo(APP_NAME, "Zatiaľ ste nič neskopírovali."))
            return

        self.popup_visible = True
        lazy_load_ui()
        
        pop = ctk.CTkToplevel(self.root)
        pop.title(f"{APP_NAME} – Dashboard")
        pop.attributes("-topmost", True)
        
        # Icon
        ico = resource_path("kopirovacka_pro.ico")
        if os.path.exists(ico): pop.iconbitmap(ico)

        # Glassmorphism feel: w=550, h=650
        w, h = 550, 650
        sw, sh = pop.winfo_screenwidth(), pop.winfo_screenheight()
        pop.geometry(f"{w}x{h}+{(sw-w)//2}+{(sh-h)//2}")
        pop.focus_force()

        # UI Components
        ctk.CTkLabel(pop, text="Vaša História", font=("Segoe UI Variable Display", 28, "bold"), text_color="#1a202c").pack(pady=(25, 5))
        
        scroll = ctk.CTkScrollableFrame(pop, fg_color="transparent", border_width=0)
        scroll.pack(fill="both", expand=True, padx=25, pady=10)

        def on_select(t):
            self.suppress_monitor = True # Dočasne vypneme sledovanie
            pyperclip.copy(t)
            self.last_item = t
            
            # Presunieme na vrch v histórii (aby bol najnovší)
            with self.lock:
                if t in self.history:
                    self.history.remove(t)
                self.history.append(t)

            if not self.pinned:
                pop.destroy()
                self.popup_visible = False
                time.sleep(0.12)
                keyboard.send("ctrl+v")
                self.root.after(500, lambda: setattr(self, "suppress_monitor", False))
            else:
                self._render_items(scroll, on_select)
                self.root.after(500, lambda: setattr(self, "suppress_monitor", False))

        self._render_items(scroll, on_select)

        # Actions
        footer = ctk.CTkFrame(pop, fg_color="transparent")
        footer.pack(fill="x", padx=30, pady=(10, 20))
        
        # Pin Button
        pin_btn = ctk.CTkButton(
            footer, 
            text="📌 Pripnuté" if self.pinned else "🔓 Odopnuté", 
            width=110,
            fg_color="#ebf8ff" if self.pinned else "#f7fafc",
            text_color="#2b6cb0" if self.pinned else "#4a5568",
            command=lambda: self._toggle_pin(pin_btn, pop)
        )
        pin_btn.pack(side="left", padx=(0, 10))

        ctk.CTkButton(footer, text="✕ Zavrieť", fg_color="#f7fafc", text_color="#4a5568", hover_color="#edf2f7", width=90, command=lambda: self._close_pop(pop)).pack(side="left")
        
        ctk.CTkButton(footer, text="🗑️ Vyčistiť", fg_color="#fff5f5", text_color="#e53e3e", hover_color="#fed7d7", width=110, command=lambda: [self.history.clear(), self._close_pop(pop)]).pack(side="right")

        pop.protocol("WM_DELETE_WINDOW", lambda: self._close_pop(pop))
        pop.bind("<Escape>", lambda e: self._close_pop(pop))

    def _render_items(self, container, callback):
        with self.lock: items = list(reversed(self.history))
        for item in items:
            is_new = (item == self.last_item)
            f = ctk.CTkFrame(container, fg_color="#f0fff4" if is_new else "#ffffff", corner_radius=15, border_width=1, border_color="#e2e8f0")
            f.pack(fill="x", pady=6, padx=5)
            
            p_text = item[:MAX_PREVIEW].strip()
            if len(item) > MAX_PREVIEW: p_text += "..."
            
            lbl = ctk.CTkLabel(f, text=p_text, font=("Segoe UI", 14), justify="left", anchor="w", wraplength=450, cursor="hand2")
            lbl.pack(side="left", fill="x", expand=True, padx=15, pady=12)
            
            lbl.bind("<Button-1>", lambda e, t=item: callback(t))
            f.bind("<Button-1>", lambda e, t=item: callback(t))

    def _close_pop(self, p):
        self.popup_visible = False
        p.destroy()

    def _toggle_pin(self, btn, pop):
        self.pinned = not self.pinned
        btn.configure(
            text="📌 Pripnuté" if self.pinned else "🔓 Odopnuté",
            fg_color="#ebf8ff" if self.pinned else "#f7fafc",
            text_color="#2b6cb0" if self.pinned else "#4a5568"
        )
        pop.attributes("-topmost", True) # Re-assert topmost

    def _setup_tray(self):
        def create_img():
            s = 64
            img = Image.new("RGBA", (s, s), (0,0,0,0))
            draw = ImageDraw.Draw(img)
            draw.rounded_rectangle([4, 4, 60, 60], radius=15, fill="#2b6cb0")
            try: f = ImageFont.truetype(resource_path("segoeui.ttf"), 38)
            except: f = ImageFont.load_default()
            draw.text((32, 32), "K", fill="white", font=f, anchor="mm")
            return img

        menu = pystray.Menu(
            pystray.MenuItem("📂 Dashboard", lambda: self.root.after(0, self.toggle_dashboard)),
            pystray.MenuItem("🗑️ Vymazať všetko", lambda: self.history.clear()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("❌ Ukončiť", lambda: self.root.destroy())
        )
        return pystray.Icon("kopirovackapro", create_img(), f"{APP_NAME} Active", menu)

# ─── Main Execution ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    # 1. Hide Console & Singleton Check IMMEDIATELY
    if sys.platform == "win32":
        try:
            ctypes.windll.user32.ShowWindow(ctypes.windll.kernel32.GetConsoleWindow(), 0)
        except: pass

    try:
        mutex = ctypes.windll.kernel32.CreateMutexW(None, False, MUTEX_NAME)
        if ctypes.windll.kernel32.GetLastError() == 183:
            root = tk.Tk()
            root.withdraw()
            messagebox.showwarning(APP_NAME, "Aplikácia už beží v systéme.")
            sys.exit(0)

        # 2. Installation Routing
        curr = sys.executable
        if curr.lower().endswith(".exe") and os.path.abspath(curr).lower() != os.path.abspath(TARGET_EXE).lower():
            # Iba tu načítame UI pre inštalátor
            ProInstaller().run()
            sys.exit(0)

        # 3. App Start
        splash = SplashScreen()
        
        root = tk.Tk()
        root.withdraw()
        
        app = KopirovackaPro(root)
        
        # Zatvoriť splash screen po inicializácii (keď nabehne tray a monitoring)
        root.after(1000, lambda: splash.close())
        
        root.mainloop()

    except Exception as e:
        import traceback
        err_msg = f"Kritická chyba Pro verzie:\n{e}\n\n{traceback.format_exc()}"
        r = tk.Tk()
        r.withdraw()
        messagebox.showerror(f"{APP_NAME} – Critical Error", err_msg)
        os._exit(1)
