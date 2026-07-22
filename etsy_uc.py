import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
import time

# Create fresh options each time
def try_driver():
    options = uc.ChromeOptions()
    options.binary_location = '/home/openhands/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome'
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-gpu')
    options.add_argument('--window-size=1920,1080')
    options.add_argument('--disable-blink-features=AutomationControlled')
    
    driver = uc.Chrome(options=options)
    return driver

driver = try_driver()
driver.set_window_size(1920, 1080)

try:
    print("Navigating to Etsy dashboard...")
    driver.get('https://www.etsy.com/your/shops/me/dashboard')
    
    time.sleep(5)
    print(f"URL: {driver.current_url}")
    
    page_text = driver.find_element(By.TAG_NAME, 'body').text[:500]
    print(f"Page text: {page_text}")
    
    time.sleep(10)
    print(f"URL after 15s: {driver.current_url}")
    
    page_text2 = driver.find_element(By.TAG_NAME, 'body').text[:500]
    print(f"Page text after wait: {page_text2}")
    
    driver.save_screenshot('/tmp/etsy_uc.png')
    print("Screenshot saved")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
finally:
    try:
        driver.quit()
    except:
        pass
