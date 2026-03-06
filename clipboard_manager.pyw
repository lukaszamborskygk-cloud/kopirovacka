"""
Kopirovačka – Multi-Clipboard Manager
======================================
Sleduje schránku, ukladá viac skopírovaných textov a pri vložení
(cez Ctrl+Shift+V) ukáže zoznam na výber.

Ovládanie:
  Ctrl+C        – bežné kopírovanie, program automaticky zachytí text
  Ctrl+Shift+V  – zobrazí popup na výber z histórie schránky
  System tray   – pravý klik: Vymazať zoznam / Ukončiť
"""

import ctypes
import typing
import time
import threading
import os
import urllib.request
import tkinter as tk
from tkinter import messagebox
import customtkinter as ctk
import pyperclip
import keyboard
import pystray
from PIL import Image, ImageDraw, ImageFont


def hide_console():
    """Skryje konzolové okno (Windows)."""
    try:
        hwnd = ctypes.windll.kernel32.GetConsoleWindow()
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, 0)  # SW_HIDE
    except Exception:
        pass

# ─── Konfigurácia ────────────────────────────────────────────────────────────
POLL_INTERVAL = 0.8          # sekundy – ako často kontrolovať schránku
AUTO_RESET_MINUTES = 20      # automatický reset zoznamu po N minútach
MAX_PREVIEW_LENGTH = 80      # max dĺžka náhľadu textu v popup okne
HOTKEY = "ctrl+;"            # klávesová skratka na otvorenie výberu
MAX_HISTORY_ITEMS = 50       # maximálny počet položiek v histórii
MAX_STRING_LENGTH = 50000    # maximálna dĺžka jedného textu (prevencia OOM)


class ClipboardManager:
    """Hlavná trieda clipboard manažéra."""

    def __init__(self):
        self.clipboard_history: list[str] = []
        self.last_clipboard: str = ""
        self.running = True
        self.popup_open = False
        self.lock = threading.Lock()
        self.last_reset_time = time.time()
        
        # Pripínanie a zvuky
        self.pinned = False
        self.selected_sound = "dog1.wav"
        self.sounds = {
            "Veľký štek (Dog 1)": "dog1.wav",
            "Malý štek (Dog 2)": "dog2.wav",
            "Mačka": "cat.wav",
            "Bez zvuku": ""
        }
        
        import typing
        self.root: typing.Any = None
        self.rebuild_items_callback: typing.Any = None
        
        # Threading and UI signals
        self.icon: typing.Any = None
        self.show_popup_signal = False
        self._last_rebuild_state: typing.Any = (None, 0, None) # (posledný, počet, active)
        self._rebuild_scheduled = False
        self._current_ui_mode: typing.Any = None # "desktop" alebo "mobile"

        # Pokúsiť sa načítať aktuálny obsah schránky
        try:
            self.last_clipboard = pyperclip.paste() or ""
        except Exception:
            self.last_clipboard = ""

    # ─── Monitoring schránky ─────────────────────────────────────────────
    def poll_clipboard(self):
        """Pravidelne kontroluje schránku (beží v samostatnom vlákne)."""
        last_history_len = 0
        while self.running:
            try:
                current_text = pyperclip.paste()
                if current_text and current_text != self.last_clipboard:
                    # Hardening: Ochrana pred extrémne dlhým textom
                    if len(current_text) > MAX_STRING_LENGTH:
                        current_text = current_text[:MAX_STRING_LENGTH] + "... [SKRÁTENÉ]"

                    self.last_clipboard = current_text
                    with self.lock:
                        if current_text in self.clipboard_history:
                            self.clipboard_history.remove(current_text)
                        self.clipboard_history.append(current_text)
                        
                        # Hardening: Limit počtu položiek (FIFO)
                        if len(self.clipboard_history) > MAX_HISTORY_ITEMS:
                            self.clipboard_history.pop(0)
                        
                    # Signalizovať hlavnému vláknu o potrebe prekreslenia, ak je popup otvorený
                    if self.popup_open and self.rebuild_items_callback:
                        # Použijeme root.after_idle pre plynulejšie prekreslenie
                        if self.root and self.root.winfo_exists():
                            self.root.after_idle(self.rebuild_items_callback)
            except Exception as e:
                print(f"Error polling clipboard: {e}")

            # Auto-reset kontrola
            elapsed = time.time() - self.last_reset_time
            if elapsed >= AUTO_RESET_MINUTES * 60:
                self.reset_history()

            time.sleep(POLL_INTERVAL)

    # ─── Reset histórie ──────────────────────────────────────────────────
    def reset_history(self):
        """Vymaže celú históriu schránky."""
        with self.lock:
            self.clipboard_history.clear()
            self.last_reset_time = time.time()

    # ─── Popup okno na výber ─────────────────────────────────────────────
    def show_selection_popup(self):
        """Zobrazí Tkinter popup okno so zoznamom skopírovaných textov."""
        if self.popup_open:
            return

        with self.lock:
            items = list(self.clipboard_history)

        if not items:
            self._show_empty_notification()
            return

        self.popup_open = True

        root = ctk.CTk()
        self.root = root
        root.title("Kopirovačka – Dashboard 2026")
        root.attributes("-topmost", True)
        
        # Centrovanie okna - FIX: Šírka nastavená na 500 aby text nerozťahoval okno
        window_width = 500
        window_height = min(300 + len(items) * 90, 800)
        screen_w = root.winfo_screenwidth()
        screen_h = root.winfo_screenheight()
        x = (screen_w - window_width) // 2
        y = (screen_h - window_height) // 2
        root.geometry(f"{window_width}x{window_height}+{x}+{y}")
        root.minsize(450, 400)
        root.resizable(True, True)

        # ── Nadpis ──
        header_frame = ctk.CTkFrame(root, fg_color="transparent")
        header_frame.pack(fill="x", padx=40, pady=(30, 10))

        title_label = ctk.CTkLabel(
            header_frame,
            text="Kopirovačka",
            font=("Segoe UI Variable Display", 32, "bold"),
            text_color="#1a202c",
        )
        title_label.pack(anchor="w")

        subtitle_label = ctk.CTkLabel(
            header_frame,
            text=f"Celkom {len(items)} skopírovaných položiek • Verzia 2.0",
            font=("Segoe UI", 13),
            text_color="#718096",
        )
        subtitle_label.pack(anchor="w")

        # ── Toolbar ──
        toolbar_frame = ctk.CTkFrame(root, fg_color="white", corner_radius=20, border_width=2, border_color="#edf2f7")
        toolbar_frame.pack(fill="x", padx=40, pady=15)
        
        # Sekcia Zvuk
        sound_group = ctk.CTkFrame(toolbar_frame, fg_color="transparent")
        sound_group.pack(side="left", padx=15, pady=10)

        sound_var = ctk.StringVar()
        for k, v in self.sounds.items():
            if v == self.selected_sound:
                sound_var.set(k)
                break
        if not sound_var.get():
            sound_var.set(list(self.sounds.keys())[0])
                
        def on_sound_change(*args):
            new_selection = sound_var.get()
            self.selected_sound = self.sounds.get(new_selection, "")
            # Automatické prehratie po výbere
            threading.Thread(target=self._play_sound, daemon=True).start()
            
        sound_var.trace_add("write", on_sound_change)
        
        sound_menu = ctk.CTkOptionMenu(
            sound_group, 
            variable=sound_var, 
            values=list(self.sounds.keys()),
            font=("Segoe UI", 12, "bold"),
            fg_color="white",
            text_color="#2d3748",
            button_color="#f7fafc",
            button_hover_color="#edf2f7",
            dropdown_font=("Segoe UI", 12),
            dropdown_fg_color="white",
            dropdown_text_color="#2d3748",
            dropdown_hover_color="#f7fafc",
            width=120 # Fixná šírka
        )
        sound_menu.pack(side="left")

        # Sekcia Akcie (vždy viditeľný Reset)
        actions_group = ctk.CTkFrame(toolbar_frame, fg_color="transparent")
        actions_group.pack(side="right", padx=15, pady=10)

        def clear_all_popup():
            if messagebox.askyesno("Vymazať históriu", "Naozaj chcete vymazať celú históriu?"):
                self.reset_history()
                rebuild_items()

        clear_btn = ctk.CTkButton(
            actions_group,
            text="🗑️ Reset",
            font=("Segoe UI", 12, "bold"),
            fg_color="#fff5f5",
            text_color="#e53e3e",
            hover_color="#fed7d7",
            corner_radius=8,
            border_width=2,
            border_color="#fecaca",
            width=80,
            command=clear_all_popup
        )
        clear_btn.pack(side="right", padx=5)

        root.bind("<Escape>", lambda e: root.destroy())
        root.update_idletasks() # Prvotný layout výpočet

        # ── Scrollovateľný zoznam ──
        scrollable_frame = ctk.CTkScrollableFrame(root, fg_color="transparent")
        scrollable_frame.pack(fill="both", expand=True, padx=20, pady=0)

        # ── Footer Section ──
        footer_frame = ctk.CTkFrame(root, fg_color="transparent", height=40)
        footer_frame.pack(fill="x", padx=40, pady=(0, 15))

        pin_btn = ctk.CTkButton(
            footer_frame, 
            text="🔓 Odopnuté" if not self.pinned else "📌 Pripnuté",
            font=("Segoe UI", 11, "bold"),
            fg_color="#f0fff4" if self.pinned else "white",
            text_color="#166534" if self.pinned else "#64748b",
            hover_color="#dcfce7" if self.pinned else "#f1f5f9",
            corner_radius=10,
            border_width=2,
            border_color="#68d391" if self.pinned else "#e2e8f0",
            width=110,
            height=30
        )
        
        def toggle_pin_ui():
            self.pinned = not self.pinned
            if self.pinned:
                pin_btn.configure(text="📌 Pripnuté", fg_color="#f0fff4", text_color="#166534", border_color="#68d391")
            else:
                pin_btn.configure(text="🔓 Odopnuté", fg_color="white", text_color="#64748b", border_color="#e2e8f0")
            # Netreba nutne rebuild_items, ak sa mení len vzhľad tlačidla
            
        pin_btn.configure(command=toggle_pin_ui)
        pin_btn.pack(side="left")

        def select_item(text):
            threading.Thread(target=self._play_sound, daemon=True).start()
            self.last_clipboard = text # Okamžitý update pre highlight
            pyperclip.copy(text)
            with self.lock:
                if text in self.clipboard_history:
                    self.clipboard_history.remove(text)
                self.clipboard_history.append(text)
            
            if not self.pinned:
                root.destroy()
                self.popup_open = False
                self.root = None
                self.rebuild_items_callback = None
                time.sleep(0.1)
                keyboard.send("ctrl+v")
            else:
                rebuild_items()

        def delete_item(text):
            with self.lock:
                if text in self.clipboard_history:
                    self.clipboard_history.remove(text)
            rebuild_items()

        def close_popup(event=None):
            root.destroy()
            self.popup_open = False
            self.root = None
            self.rebuild_items_callback = None

        root.bind("<Escape>", close_popup)
        root.protocol("WM_DELETE_WINDOW", close_popup)

        self._last_rebuild_state = (None, 0) # (posledný prvok, počet prvkov)
        self._rebuild_scheduled = False

        def rebuild_items():
            if self._rebuild_scheduled:
                return
            self._rebuild_scheduled = True
            
            def _perform_rebuild():
                self._rebuild_scheduled = False
                try:
                    if not root or not root.winfo_exists():
                        return
                except Exception:
                    return

                with self.lock:
                    current_items = list(self.clipboard_history)
                    last_item = current_items[-1] if current_items else None
                    state = (last_item, len(current_items), self.last_clipboard)

                # Optimalizácia výkonu: prekresľujeme len ak sa reálne niečo zmenilo
                if state == self._last_rebuild_state:
                    return
                self._last_rebuild_state = state

                # Vyčistiť existujúce widgety
                for widget in scrollable_frame.winfo_children():
                    widget.destroy()

                if not current_items:
                    empty_label = ctk.CTkLabel(
                        scrollable_frame,
                        text="Zatiaľ tu nie sú žiadne dáta na zobrazenie.",
                        font=("Segoe UI", 14),
                        text_color="#a0aec0",
                    )
                    empty_label.pack(pady=40)
                    return

                for i, item in enumerate(reversed(current_items)):
                    idx = len(current_items) - i
                    is_active = (item == self.last_clipboard)
                    
                    # Colors
                    if is_active:
                        card_bg = "#f0fff4"
                        border = "#68d391"
                        text_col = "#14532d"
                        status_col = "#166534"
                        status_text = "AKTÍVNE"
                    else:
                        card_bg = "white"
                        border = "#f1f5f9"
                        text_col = "#334155"
                        status_col = "#94a3b8"
                        status_text = f"#{idx}"

                    # Karta s dynamickou výškou (odstránené height=36 a pack_propagate)
                    card = ctk.CTkFrame(
                        scrollable_frame, 
                        fg_color=card_bg, 
                        corner_radius=15,
                        border_width=2,
                        border_color=border
                    )
                    card.pack(fill="x", padx=15, pady=4) # 4px medzera medzi kartami

                    # Layout inside card - Dynamic Row
                    inner = ctk.CTkFrame(card, fg_color="transparent")
                    inner.pack(fill="both", expand=True, padx=8, pady=5) # Viac miesta vnútri karty

                    # Status label (zarovnaný hore)
                    ctk.CTkLabel(inner, text=status_text, font=("Segoe UI", 10, "bold"), text_color=status_col).pack(side="left", anchor="n", pady=(5, 0))

                    preview = item.strip()
                    # Rozumný limit pre preview, ak by bol text extrémne dlhý (viac ako 1000 znakov)
                    if len(preview) > 1000:
                        preview = preview[:1000] + "…"

                    # Viacriadkový text cez CTkLabel (podporuje justify="left")
                    text_label = ctk.CTkLabel(
                        inner,
                        text=preview,
                        font=("Segoe UI", 13),
                        text_color=text_col,
                        anchor="w",
                        justify="left",
                        cursor="hand2",
                        wraplength=380 # FIX: Pevný wraplength aby nerobit feedback loop so sirkou okna
                    )
                    text_label.pack(side="left", fill="x", expand=True, padx=(8, 0))
                    
                    # Klikateľnosť celej karty a textu
                    def on_click(e, t=item):
                        select_item(t)
                        
                    text_label.bind("<Button-1>", on_click)
                    card.bind("<Button-1>", on_click)
                    inner.bind("<Button-1>", on_click)

                    # Delete btn (mini - zarovnaný hore)
                    del_btn = ctk.CTkButton(
                        inner,
                        text="✕",
                        font=("Segoe UI", 12),
                        fg_color="transparent",
                        text_color="#ef4444",
                        hover_color="#fef2f2",
                        width=24,
                        height=24,
                        corner_radius=8,
                        command=lambda t=item: delete_item(t)
                    )
                    del_btn.pack(side="right", anchor="n", padx=(5, 0), pady=(2, 0))

                for i in range(min(9, len(current_items))):
                    item_text = list(reversed(current_items))[i]
                    root.bind(str(i + 1), lambda e, t=item_text: select_item(t))
            
            root.after_idle(_perform_rebuild)


        self.rebuild_items_callback = rebuild_items
        rebuild_items()

        root.focus_force()
        root.mainloop()

    def _show_empty_notification(self):
        """Zobrazí krátku notifikáciu, že zoznam je prázdny."""
        ctk.set_appearance_mode("light")
        root = ctk.CTk()
        root.title("Kopirovačka")
        root.attributes("-topmost", True)
        root.geometry("320x100+{}+{}".format(
            (root.winfo_screenwidth() - 320) // 2,
            (root.winfo_screenheight() - 100) // 2,
        ))
        root.resizable(False, False)

        frame = ctk.CTkFrame(root, fg_color="transparent")
        frame.pack(expand=True, fill="both")

        ctk.CTkLabel(
            frame,
            text="📋 Zoznam je prázdny",
            font=("Segoe UI", 16, "bold"),
            text_color="#2d3748"
        ).pack(pady=(15, 5))

        ctk.CTkLabel(
            frame,
            text="Najprv niečo skopíruj (Ctrl+C)",
            font=("Segoe UI", 12),
            text_color="#718096"
        ).pack()

        root.after(2000, root.destroy)
        root.mainloop()

    def _play_sound(self):
        """Zahraje vybraný zvuk štekajúceho psa/mačky."""
        if not self.selected_sound:
            return  # Používateľ vybral "Bez zvuku"
            
        try:
            import winsound
            sound_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), self.selected_sound)
            
            # Ak zvuk ešte nemáme, stiahneme ho
            if not os.path.exists(sound_path):
                urls = {
                    "dog1.wav": "https://bigsoundbank.com/static/sounds/0111.wav",
                    "dog2.wav": "https://bigsoundbank.com/static/sounds/0112.wav",
                    "cat.wav": "https://bigsoundbank.com/static/sounds/0151.wav"
                }
                if self.selected_sound in urls:
                    url = urls[self.selected_sound]
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                    try:
                        with urllib.request.urlopen(req) as response:
                            data = response.read()
                            with open(sound_path, 'wb') as out_file:
                                out_file.write(data)
                    except Exception:
                        return # Ak nevieme stiahnuť, ticho
            
            if os.path.exists(sound_path):
                # Prehráme zvuk bez blokovania
                # SND_FILENAME = 0x00020000, SND_ASYNC = 0x0001
                try:
                    winsound.PlaySound(sound_path, 0x00020000 | 0x0001)
                except Exception:
                    pass
        except Exception:
            pass

    # ─── System tray ikona ───────────────────────────────────────────────
    def create_tray_icon(self) -> pystray.Icon:
        """Vytvorí system tray ikonu s menu."""
        image = self._create_icon_image()

        def on_reset(icon, item):
            self.reset_history()

        def on_show(icon, item):
            self.on_hotkey()

        def on_quit(icon, item):
            self.running = False
            icon.stop()

        def get_count(item):
            with self.lock:
                return f"Položiek: {len(self.clipboard_history)}"

        menu = pystray.Menu(
            pystray.MenuItem(get_count, None, enabled=False),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("📋 Zobraziť zoznam", on_show),
            pystray.MenuItem("🗑️ Vymazať zoznam", on_reset),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("❌ Ukončiť", on_quit),
        )

        icon = pystray.Icon(
            "kopirovacka",
            image,
            "Kopirovačka – Multi-Clipboard",
            menu,
        )
        return icon

    @staticmethod
    def _create_icon_image() -> Image.Image:
        """Vygeneruje jednoduchú ikonu pre system tray."""
        size = 64
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Pozadie – zaoblený štvorec
        draw.rounded_rectangle(
            [4, 4, size - 4, size - 4],
            radius=12,
            fill="#3182ce",
        )

        # Písmeno "K" v strede
        try:
            fnt = ImageFont.truetype("segoeui.ttf", 36)
        except Exception:
            fnt = ImageFont.load_default()

        draw.text(
            (size // 2, size // 2),
            "K",
            fill="white",
            font=fnt,
            anchor="mm",
        )

        return img

    # ─── Hlavný beh ──────────────────────────────────────────────────────
    def run(self):
        """Spustí clipboard manažéra."""
        # Globálne nastavenia pre CustomTkinter
        ctk.set_appearance_mode("light")
        ctk.set_default_color_theme("blue")
        
        print("=" * 50)
        print("  📋 Kopirovačka – Multi-Clipboard Manager")
        print("=" * 50)
        print(f"  Ctrl+;        → Zobraziť zoznam na výber")
        print(f"  Auto-reset    → Každých {AUTO_RESET_MINUTES} minút")
        print(f"  System tray   → Pravý klik pre menu")
        print("=" * 50)
        print("  Program beží... (minimalizuj toto okno)")
        print()

        # Spustiť monitoring schránky
        poll_thread = threading.Thread(target=self.poll_clipboard, daemon=True)
        poll_thread.start()

        # Registrovať globálnu klávesovú skratku
        keyboard.add_hotkey(HOTKEY, self.on_hotkey, suppress=True)

        # Spustiť system tray ikonu v SAMOSTATNOM vlákne
        self.icon = self.create_tray_icon()
        threading.Thread(target=self.icon.run, daemon=True).start()

        # Hlavná slučka v HLAVNOM vlákne (pre thread-safety Tkinteru)
        try:
            while self.running:
                if self.show_popup_signal:
                    self.show_popup_signal = False
                    try:
                        self.show_selection_popup()
                    except Exception as e:
                        print(f"Popup error: {e}")
                time.sleep(0.1)
        except KeyboardInterrupt:
            pass
        finally:
            self.running = False
            if self.icon:
                self.icon.stop()
            keyboard.unhook_all()
            print("\n  Kopirovačka ukončená. Dovidenia! 👋")

    def on_hotkey(self):
        """Spracuje stlačenie klávesovej skratky - signalizuje hlavnému vláknu."""
        if not self.popup_open:
            self.show_popup_signal = True


if __name__ == "__main__":
    # Singleton check pomocou Windows Mutexu
    import ctypes
    from tkinter import messagebox

    mutex_name = "Kopirovacka_Singleton_Mutex_2026"
    mutex = ctypes.windll.kernel32.CreateMutexW(None, False, mutex_name)
    last_error = ctypes.windll.kernel32.GetLastError()

    if last_error == 183:  # ERROR_ALREADY_EXISTS
        root = tk.Tk()
        root.withdraw()
        messagebox.showwarning(
            "Kopírovačka už beží",
            "Program už je spustený na pozadí.\nPozrite si ikonku v lište (pri hodinách) !!!!!!! nezapinaj ho zas  cmuk <3."
        )
        root.destroy()
        os._exit(0)

    hide_console()
    try:
        manager = ClipboardManager()
        manager.run()
    except Exception as e:
        import tkinter as tk
        from tkinter import messagebox
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(
            "Kopírovačka – Kritická chyba",
            f"Aplikácia musela byť ukončená z dôvodu chyby:\n\n{e}\n\nSystém zostáva v bezpečí."
        )
        root.destroy()
    finally:
        import keyboard
        keyboard.unhook_all()
        # Zabezpečiť, že nezostanú visieť žiadne procesy
        import os
        os._exit(0)

