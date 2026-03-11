import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def get_retail_data():
    """Generates synthetic retail data with macro-economic correlations."""
    np.random.seed(42)
    stores = ["Store A", "Store B", "Store C", "Store D"]
    products = ["Electronics", "Apparel", "Grocery", "Home & Garden"]
    start_date = datetime(2023, 1, 1)
    
    data = []
    for w in range(104):  # 2 years of weekly data
        curr_date = start_date + timedelta(weeks=w)
        
        # Macro factors
        fuel_price = 3.50 + 0.5 * np.sin((w % 52 / 52) * 2 * np.pi) + np.random.normal(0, 0.1)
        cpi_trend = 100 + (w * 0.05) 
        seasonality = 1 + 0.3 * np.sin((w % 52 / 52) * 2 * np.pi)
        
        for store in stores:
            for product in products:
                base_sales = 20000 if product == "Electronics" else 12000
                
                # Correlation Logic: Fuel price impacts discretionary spending (Electronics)
                fuel_impact = -2000 * (fuel_price - 3.50) if product == "Electronics" else 0
                noise = np.random.normal(0, 1000)
                
                sales = max(0, int((base_sales * seasonality) + fuel_impact + noise))
                
                data.append({
                    "date": curr_date,
                    "store": store,
                    "product": product,
                    "sales": sales,
                    "fuel_price": round(fuel_price, 2),
                    "cpi": round(cpi_trend, 2),
                    "is_holiday": 1 if w in [51, 52, 103, 104] else 0
                })
                
    return pd.DataFrame(data)