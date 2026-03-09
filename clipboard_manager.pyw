"""
Kopirovačka – Multi-Clipboard Manager (Premium v2.0)
====================================================
Vysoko výkonný manažér schránky s minimálnou stopou.
"""

import ctypes
import time
import threading
import os
import sys
import urllib.request
import shutil
import subprocess
import tkinter as tk
from tkinter import messagebox
from PIL import Image, ImageDraw, ImageFont

# ─── Globálne premenné a konfigurácia ──────────────────────────────────────────
POLL_INTERVAL = 1.0          # sekundy – kontrola schránky
AUTO_RESET_MINUTES = 20      # automatický reset
HOTKEY = "ctrl+;"            # klávesová skratka
MAX_HISTORY_ITEMS = 50       
MAX_STRING_LENGTH = 50000    

# Dynamické importy (Lazy loading pre rýchly štart)
ctk = None
pyperclip = None
keyboard = None
pystray = None

def lazy_load_core():
    """ Načíta základné knižnice potrebné pre beh na pozadí. """
    global pyperclip, keyboard, pystray
    if pyperclip is None:
        import pyperclip as _pyperclip
        pyperclip = _pyperclip
    if keyboard is None:
        import keyboard as _keyboard
        keyboard = _keyboard
    if pystray is None:
        import pystray as _pystray
        pystray = _pystray

def lazy_load_ui():
    """ Načíta ťažké UI knižnice len keď sú reálne potrebné. """
    global ctk
    if ctk is None:
        import customtkinter as _ctk
        ctk = _ctk
        ctk.set_appearance_mode("light")
        ctk.set_default_color_theme("blue")

def resource_path(relative_path):
    """ Získa absolútnu cestu k resourcom. """
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

# ─── Inštalátor ───────────────────────────────────────────────────────────────
class KopirovackaInstaller:
    """ Profesionálny inštalátor (beží v čistom Tkinteri pre rýchlosť). """
    def __init__(self):
        lazy_load_ui() # Tu potrebujeme CustomTkinter pre pekný vzhľad
        self.root = ctk.CTk()
        self.root.title("Inštalácia Kopírovačky")
        self.root.geometry("500x350")
        self.root.resizable(False, False)
        self.root.attributes("-topmost", True)
        
        # Centrovanie
        screen_w = self.root.winfo_screenwidth()
        screen_h = self.root.winfo_screenheight()
        x = (screen_w - 500) // 2
        y = (screen_h - 350) // 2
        self.root.geometry(f"+{x}+{y}")

        self.appdata_dir = os.path.join(os.environ["APPDATA"], "Kopirovacka")
        self.target_exe = os.path.join(self.appdata_dir, "Kopirovacka.exe")
        self.current_exe = sys.executable
        
        self.create_shortcut_var = tk.BooleanVar(value=True)
        
        # Ikona okna
        ico_path = resource_path("app_icon.ico")
        if os.path.exists(ico_path):
            self.root.iconbitmap(ico_path)

        self._build_welcome_screen()

    def _build_welcome_screen(self):
        self._clear_screen()
        ctk.CTkLabel(self.root, text="Vitajte v inštalácii", font=("Segoe UI", 24, "bold")).pack(pady=(40, 10))
        ctk.CTkLabel(self.root, text="Prémiová verzia Kopírovačky bude nainštalovaná do vášho PC.", font=("Segoe UI", 13)).pack(pady=10)
        
        shortcut_check = ctk.CTkCheckBox(self.root, text="Vytvoriť odkaz na ploche", variable=self.create_shortcut_var)
        shortcut_check.pack(pady=20)

        btn_frame = ctk.CTkFrame(self.root, fg_color="transparent")
        btn_frame.pack(side="bottom", fill="x", padx=20, pady=20)
        ctk.CTkButton(btn_frame, text="Zrušiť", width=100, fg_color="#edf2f7", text_color="#2d3748", command=self.root.destroy).pack(side="left")
        ctk.CTkButton(btn_frame, text="Inštalovať", width=120, command=self._start_installation).pack(side="right")

    def _start_installation(self):
        self._clear_screen()
        ctk.CTkLabel(self.root, text="Inštalujem...", font=("Segoe UI", 20, "bold")).pack(pady=(60, 20))
        self.progress_bar = ctk.CTkProgressBar(self.root, width=400)
        self.progress_bar.set(0)
        self.progress_bar.pack(pady=10)
        
        threading.Thread(target=self._run_install_logic, daemon=True).start()

    def _run_install_logic(self):
        try:
            time.sleep(0.5) # Krátky moment pre UI
            if not os.path.exists(self.appdata_dir):
                os.makedirs(self.appdata_dir)
            
            self.root.after(0, lambda: self.progress_bar.set(0.5))
            shutil.copy2(self.current_exe, self.target_exe)

            if self.create_shortcut_var.get():
                desktop = os.path.join(os.environ["USERPROFILE"], "Desktop")
                shortcut_path = os.path.join(desktop, "Kopírovačka.lnk")
                ps_cmd = (
                    f'$WshShell = New-Object -ComObject WScript.Shell; '
                    f'$Shortcut = $WshShell.CreateShortcut(\'{shortcut_path}\'); '
                    f'$Shortcut.TargetPath = \'{self.target_exe}\'; '
                    f'$Shortcut.IconLocation = \'{self.target_exe},0\'; '
                    f'$Shortcut.WorkingDirectory = \'{self.appdata_dir}\'; '
                    f'$Shortcut.Save()'
                )
                subprocess.run(["powershell", "-Command", ps_cmd], capture_output=True, check=True)

            self.root.after(0, lambda: self.progress_bar.set(1.0))
            self.root.after(200, self._show_finish_screen)
        except Exception as e:
            self.root.after(0, lambda e=e: messagebox.showerror("Chyba", str(e)))
            self.root.after(0, self.root.destroy)

    def _show_finish_screen(self):
        self._clear_screen()
        ctk.CTkLabel(self.root, text="Dokončené! 🚀", font=("Segoe UI", 22, "bold"), text_color="#2f855a").pack(pady=(60, 20))
        ctk.CTkButton(self.root, text="Spustiť a Dokončiť", width=150, command=self._finish).pack(pady=20)

    def _finish(self):
        os.startfile(self.target_exe)
        self.root.destroy()
        os._exit(0)

    def _clear_screen(self):
        for widget in self.root.winfo_children(): widget.destroy()

# ─── Clipboard Manager ───────────────────────────────────────────────────────
class ClipboardManager:
    def __init__(self, root):
        self.root = root
        self.history = []
        self.last_item = ""
        self.lock = threading.Lock()
        self.last_reset = time.time()
        self.popup_open = False
        self.pinned = False
        self.selected_sound = "dog1.wav"
        self.compatibility_mode = False
        
        lazy_load_core()
        
        # Skús načítať úvodný stav
        try: self.last_item = pyperclip.paste() or ""
        except: pass

        # Tray ikona
        self.icon = self._create_tray_icon()
        
        # Spustiť monitoring
        threading.Thread(target=self._monitor_loop, daemon=True).start()
        
        # Registrovať Hotkey
        keyboard.add_hotkey(HOTKEY, lambda: self.root.after(0, self.show_popup), suppress=False)

        # Spustiť Tray v samostatnom vlákne
        threading.Thread(target=self.icon.run, daemon=True).start()

    def _monitor_loop(self):
        while True:
            try:
                current = pyperclip.paste()
                if current and current != self.last_item:
                    if len(current) > MAX_STRING_LENGTH:
                        current = current[:MAX_STRING_LENGTH] + "... [SKRÁTENÉ]"
                    
                    with self.lock:
                        if current in self.history: self.history.remove(current)
                        self.history.append(current)
                        if len(self.history) > MAX_HISTORY_ITEMS: self.history.pop(0)
                        self.last_item = current
                
                # Auto-reset
                if time.time() - self.last_reset > AUTO_RESET_MINUTES * 60:
                    self.history.clear()
                    self.last_reset = time.time()
                    
            except: pass
            time.sleep(POLL_INTERVAL)

    def show_popup(self):
        if self.popup_open: return
        if not self.history:
            self._notify_empty()
            return

        self.popup_open = True
        lazy_load_ui()
        
        popup = ctk.CTkToplevel(self.root)
        popup.title("Dashboard")
        popup.attributes("-topmost", True)
        
        # Ikona
        ico_path = resource_path("app_icon.ico")
        if os.path.exists(ico_path): popup.iconbitmap(ico_path)

        # Rozmery a centrovanie
        w, h = 500, 600
        sw, sh = popup.winfo_screenwidth(), popup.winfo_screenheight()
        popup.geometry(f"{w}x{h}+{(sw-w)//2}+{(sh-h)//2}")

        # --- Obsah ---
        title = ctk.CTkLabel(popup, text="Kopirovačka", font=("Segoe UI Variable Display", 30, "bold"))
        title.pack(pady=(20, 10))

        scroll = ctk.CTkScrollableFrame(popup, fg_color="transparent")
        scroll.pack(fill="both", expand=True, padx=20, pady=10)

        def select(text):
            pyperclip.copy(text)
            self.last_item = text
            self._play_sound()
            if not self.pinned:
                popup.destroy()
                self.popup_open = False
                time.sleep(0.4 if self.compatibility_mode else 0.1)
                keyboard.send("ctrl+v")
            else:
                self.update_list(scroll, popup)

        self.update_list(scroll, popup, select)
        
        # Footer
        footer = ctk.CTkFrame(popup, fg_color="transparent")
        footer.pack(fill="x", padx=20, pady=15)
        
        pin_btn = ctk.CTkButton(footer, text="📌 Pripnuté" if self.pinned else "🔓 Odopnuté", width=100, 
                                 command=lambda: self._toggle_pin(pin_btn))
        pin_btn.pack(side="left")
        
        ctk.CTkButton(footer, text="🗑️ Vymazať všetko", fg_color="#fff5f5", text_color="#e53e3e", width=120,
                      command=lambda: [self.history.clear(), self.update_list(scroll, popup, select)]).pack(side="right")

        popup.protocol("WM_DELETE_WINDOW", lambda: [setattr(self, "popup_open", False), popup.destroy()])
        popup.bind("<Escape>", lambda e: [setattr(self, "popup_open", False), popup.destroy()])

    def update_list(self, scroll, popup, select_callback):
        for w in scroll.winfo_children(): w.destroy()
        with self.lock:
            items = list(reversed(self.history))
            
        for item in items:
            is_active = (item == self.last_item)
            frame = ctk.CTkFrame(scroll, fg_color="#f0fff4" if is_active else "white", corner_radius=12, border_width=1)
            frame.pack(fill="x", pady=4, padx=5)
            
            lbl = ctk.CTkLabel(frame, text=item[:300].strip(), font=("Segoe UI", 13), justify="left", anchor="w", wraplength=380, cursor="hand2")
            lbl.pack(side="left", fill="x", expand=True, padx=12, pady=10)
            lbl.bind("<Button-1>", lambda e, t=item: select_callback(t))
            frame.bind("<Button-1>", lambda e, t=item: select_callback(t))

    def _toggle_pin(self, btn):
        self.pinned = not self.pinned
        btn.configure(text="📌 Pripnuté" if self.pinned else "🔓 Odopnuté")

    def _notify_empty(self):
        messagebox.showinfo("Kopirovačka", "História je prázdna. Skúste niečo skopírovať!")

    def _play_sound(self):
        if not self.selected_sound: return
        try:
            import winsound
            p = resource_path(self.selected_sound)
            if os.path.exists(p):
                winsound.PlaySound(p, 0x00020000 | 0x0001)
        except: pass

    def _create_tray_icon(self):
        img = self._create_icon_img()
        menu = pystray.Menu(
            pystray.MenuItem("📋 Dashboard", lambda: self.root.after(0, self.show_popup)),
            pystray.MenuItem("🗑️ Vymazať históriu", lambda: self.history.clear()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("❌ Ukončiť", lambda: self.root.destroy())
        )
        return pystray.Icon("kopirovacka", img, "Kopírovačka", menu)

    def _create_icon_img(self):
        size = 64
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([4, 4, 60, 60], radius=12, fill="#3182ce")
        try:
            f = ImageFont.truetype(resource_path("segoeui.ttf"), 36)
        except:
            f = ImageFont.load_default()
        d.text((32, 32), "K", fill="white", font=f, anchor="mm")
        return img

# ─── Entry Point ─────────────────────────────────────────────────────────────
def hide_console():
    if sys.platform == "win32":
        ctypes.windll.user32.ShowWindow(ctypes.windll.kernel32.GetConsoleWindow(), 0)

if __name__ == "__main__":
    try:
        # Singleton check
        mutex = ctypes.windll.kernel32.CreateMutexW(None, False, "Kopirovacka_Premium_2026")
        if ctypes.windll.kernel32.GetLastError() == 183:
            root = tk.Tk()
            root.withdraw()
            messagebox.showwarning("Kopírovačka", "Aplikácia už beží v systéme.")
            sys.exit(0)

        hide_console()

        # Inštalácia
        current_exe = sys.executable
        target_path = os.path.join(os.environ["APPDATA"], "Kopirovacka", "Kopirovacka.exe")
        
        if current_exe.lower().endswith(".exe") and os.path.abspath(current_exe).lower() != os.path.abspath(target_path).lower():
            installer = KopirovackaInstaller()
            installer.run()
            sys.exit(0)

        # Hlavná aplikácia
        root = tk.Tk()
        root.withdraw() # Skryté hlavné okno
        
        manager = ClipboardManager(root)
        root.mainloop()

    except Exception as e:
        import traceback
        err = f"Kritická chyba: {e}\n{traceback.format_exc()}"
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Kopírovačka Error", err)
        os._exit(1)
