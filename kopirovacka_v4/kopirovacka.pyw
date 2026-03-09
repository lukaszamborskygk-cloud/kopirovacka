"""
📋 Kopírovačka v4 (Simple & Fast)
=================================
Ultra-rýchly štart, nulové sekanie, maximálna stabilita.
Urobil: AI Profi Programátor
"""

import os
import sys
import tkinter as tk
from tkinter import ttk, messagebox
import threading
import time
import ctypes
import subprocess
import shutil

# --- Konfigurácia ---
APP_NAME = "Kopírovačka"
VERSION = "4.0.0"
HOTKEY = "ctrl+;"
MAX_HISTORY = 50
APPDATA_FOLDER = os.path.join(os.environ["APPDATA"], "Kopirovacka")
TARGET_EXE = os.path.join(APPDATA_FOLDER, "Kopirovacka.exe")
MUTEX_NAME = "Kopirovacka_Simple_v4_Mutex"

# Lazy-ish imports for speed
pystray = None
pyperclip = None
keyboard = None
Image = None

def lazy_load():
    global pystray, pyperclip, keyboard, Image
    if pystray is None: import pystray
    if pyperclip is None: import pyperclip
    if keyboard is None: import keyboard
    from PIL import Image as _Image
    Image = _Image

def resource_path(relative_path):
    try: base_path = sys._MEIPASS
    except: base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

# --- Aplikácia ---
class KopirovackaApp:
    def __init__(self, root):
        self.root = root
        self.history = []
        self.last_item = ""
        self.popup_visible = False
        self.pinned = False
        self.suppress_monitor = False
        self.lock = threading.Lock()
        
        lazy_load()
        
        # Singleton poistka
        try:
            self.last_item = pyperclip.paste() or ""
        except: pass

        # Ikona a Tray
        self.setup_tray()
        
        # Hotkey
        keyboard.add_hotkey(HOTKEY, self.show_dashboard, suppress=False)

        # Monitorovacie vlákno
        threading.Thread(target=self.monitor_loop, daemon=True).start()

    def setup_tray(self):
        def create_image():
            img = Image.new('RGBA', (64, 64), (26, 54, 93, 255)) # #1a365d
            # Simple "K" icon
            return img

        menu = pystray.Menu(
            pystray.MenuItem("Otvoriť", self.show_dashboard),
            pystray.MenuItem("Vymazať históriu", self.clear_history),
            pystray.MenuItem("Ukončiť", self.exit_app)
        )
        self.icon = pystray.Icon("kopirovacka", create_image(), APP_NAME, menu)
        threading.Thread(target=self.icon.run, daemon=True).start()

    def monitor_loop(self):
        while True:
            if not self.suppress_monitor:
                try:
                    current = pyperclip.paste()
                    if current and current != self.last_item:
                        with self.lock:
                            if current in self.history: self.history.remove(current)
                            self.history.insert(0, current)
                            if len(self.history) > MAX_HISTORY: self.history.pop()
                            self.last_item = current
                except: pass
            time.sleep(0.5)

    def show_dashboard(self, event=None):
        if self.popup_visible: return
        if not self.history:
            messagebox.showinfo(APP_NAME, "História je prázdna.")
            return

        self.popup_visible = True
        self.dash = tk.Toplevel(self.root)
        self.dash.title(APP_NAME)
        self.dash.attributes("-topmost", True)
        self.dash.overrideredirect(True) # Borderless feel
        
        # Pozícia pri kurzore
        x, y = self.root.winfo_pointerxy()
        self.dash.geometry(f"450x550+{x-225}+{y-50}")
        
        # Styling
        main_frame = tk.Frame(self.dash, bg="#f7fafc", highlightthickness=2, highlightbackground="#2b6cb0")
        main_frame.pack(fill="both", expand=True)

        header = tk.Label(main_frame, text="📋 História schránky", font=("Segoe UI", 16, "bold"), bg="#2b6cb0", fg="white", pady=10)
        header.pack(fill="x")

        # Scrollable area
        canvas = tk.Canvas(main_frame, bg="#f7fafc", highlightthickness=0)
        scrollbar = ttk.Scrollbar(main_frame, orient="vertical", command=canvas.yview)
        hist_frame = tk.Frame(canvas, bg="#f7fafc")

        canvas.create_window((0, 0), window=hist_frame, anchor="nw", width=430)
        canvas.configure(yscrollcommand=scrollbar.set)

        def on_frame_configure(e):
            canvas.configure(scrollregion=canvas.bbox("all"))

        hist_frame.bind("<Configure>", on_frame_configure)
        canvas.pack(side="left", fill="both", expand=True, padx=(10, 0), pady=10)
        scrollbar.pack(side="right", fill="y")

        self.render_items(hist_frame)

        # Footer
        footer = tk.Frame(main_frame, bg="#edf2f7", pady=10)
        footer.pack(fill="x")

        pin_btn = tk.Button(footer, text="📌 Pripnúť" if self.pinned else "🔓 Odopnúť", 
                           command=self.toggle_pin, font=("Segoe UI", 10), bg="#cbd5e0", relief="flat")
        pin_btn.pack(side="left", padx=20)

        tk.Button(footer, text="Zavrieť", command=self.close_dash, bg="#feb2b2", relief="flat").pack(side="right", padx=20)

        self.dash.bind("<Escape>", lambda e: self.close_dash())
        self.dash.focus_force()

    def render_items(self, container):
        for i, text in enumerate(self.history):
            short_text = text[:150].replace('\n', ' ') + ("..." if len(text) > 150 else "")
            btn = tk.Button(container, text=short_text, font=("Segoe UI", 11), anchor="w", 
                           bg="white", activebackground="#ebf8ff", relief="flat", justify="left",
                           padx=15, pady=8, wraplength=400,
                           command=lambda t=text: self.select_item(t))
            btn.pack(fill="x", pady=2, padx=5)

    def select_item(self, text):
        self.suppress_monitor = True
        try:
            pyperclip.copy(text)
            self.last_item = text
            # Presun na vrch
            with self.lock:
                if text in self.history: self.history.remove(text)
                self.history.insert(0, text)
            
            if not self.pinned:
                self.close_dash()
                time.sleep(0.1)
                keyboard.send("ctrl+v")
            else:
                self.show_dashboard() # Re-render v stávajúcom okne by bolo zložitejšie v čistom tk, urobíme skokový refresh
        finally:
            self.root.after(500, self.release_monitor)

    def release_monitor(self):
        self.suppress_monitor = False

    def toggle_pin(self):
        self.pinned = not self.pinned
        self.close_dash()
        self.show_dashboard()

    def close_dash(self):
        if hasattr(self, 'dash'):
            self.dash.destroy()
        self.popup_visible = False

    def clear_history(self):
        with self.lock: self.history.clear()
        self.close_dash()

    def exit_app(self):
        self.icon.stop()
        self.root.quit()

# --- Inštalátor ---
class SimpleInstaller:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Inštalácia Kopírovačky")
        self.root.geometry("400x250")
        
        tk.Label(self.root, text="Inštalácia Kopírovačky", font=("Segoe UI", 18, "bold")).pack(pady=20)
        tk.Label(self.root, text="Chcete nainštalovať aplikáciu do počítača\na vytvoriť odkaz na ploche?").pack(pady=10)
        
        btn_f = tk.Frame(self.root)
        btn_f.pack(pady=20)
        
        tk.Button(btn_f, text="Áno, nainštalovať", command=self.install, bg="#48bb78", fg="white", padx=20, pady=10).pack(side="left", padx=10)
        tk.Button(btn_f, text="Nie, len spustiť", command=self.run_once, padx=20, pady=10).pack(side="right", padx=10)

    def install(self):
        try:
            if not os.path.exists(APPDATA_FOLDER): os.makedirs(APPDATA_FOLDER)
            shutil.copy2(sys.executable, TARGET_EXE)
            
            # Shortcut
            desktop = os.path.join(os.environ["USERPROFILE"], "Desktop")
            path = os.path.join(desktop, f"{APP_NAME}.lnk")
            ps = (
                f'$WshShell = New-Object -ComObject WScript.Shell; '
                f'$Shortcut = $WshShell.CreateShortcut(\'{path}\'); '
                f'$Shortcut.TargetPath = \'{TARGET_EXE}\'; '
                f'$Shortcut.IconLocation = \'{TARGET_EXE},0\'; '
                f'$Shortcut.Save()'
            )
            subprocess.run(["powershell", "-Command", ps], capture_output=True)
            
            messagebox.showinfo("Hotovo", "Inštalácia prebehla úspešne!")
            os.startfile(TARGET_EXE)
            sys.exit(0)
        except Exception as e:
            messagebox.showerror("Chyba", f"Inštalácia zlyhala: {e}")

    def run_once(self):
        self.root.destroy()

    def run(self):
        self.root.mainloop()

# --- Entry Point ---
if __name__ == "__main__":
    # Singleton check
    mutex = ctypes.windll.kernel32.CreateMutexW(None, False, MUTEX_NAME)
    if ctypes.windll.kernel32.GetLastError() == 183:
        sys.exit(0)

    # Console hide
    try: ctypes.windll.user32.ShowWindow(ctypes.windll.kernel32.GetConsoleWindow(), 0)
    except: pass

    # Install routing
    curr = os.path.abspath(sys.executable)
    if curr.lower().endswith(".exe") and curr.lower() != os.path.abspath(TARGET_EXE).lower():
        SimpleInstaller().run()

    # Main App
    root = tk.Tk()
    root.withdraw()
    app = KopirovackaApp(root)
    root.mainloop()
