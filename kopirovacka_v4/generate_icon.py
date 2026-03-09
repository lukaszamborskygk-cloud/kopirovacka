from PIL import Image, ImageDraw, ImageFont
import os

def create_ico():
    size = 256
    img = Image.new("RGBA", (size, size), (26, 54, 93, 255)) # Deep Blue
    draw = ImageDraw.Draw(img)
    # Draw a simple white "K"
    try:
        font_paths = ["C:/Windows/Fonts/seguihis.ttf", "C:/Windows/Fonts/arial.ttf"]
        fnt = None
        for p in font_paths:
            if os.path.exists(p):
                fnt = ImageFont.truetype(p, 160)
                break
        if not fnt: fnt = ImageFont.load_default()
    except: fnt = ImageFont.load_default()
    
    draw.text((size // 2, size // 2), "K", fill="white", font=fnt, anchor="mm")
    img.save("app_icon.ico", format="ICO", sizes=[(16,16), (32,32), (48,48), (64,64), (128,128), (256,256)])
    print("Icon created!")

if __name__ == "__main__":
    create_ico()
