import pandas as pd
import numpy as np
from datetime import timedelta

def generate_forecast(df, horizon_weeks=12):
    """Calculates a trend + seasonal forecast for a filtered dataframe."""
    y = df['sales'].values
    n = len(y)
    x = np.arange(n)
    
    # Calculate Linear Trend
    slope, intercept = np.polyfit(x, y, 1)
    
    # Calculate Seasonality (Simple Average of Residuals by Month)
    df['residual'] = y - (intercept + slope * x)
    df['month'] = df['date'].dt.month
    seasonal_effects = df.groupby('month')['residual'].mean().to_dict()
    
    # Project into the future
    last_date = df['date'].max()
    forecast_rows = []
    
    for i in range(1, horizon_weeks + 1):
        future_date = last_date + timedelta(weeks=i)
        future_idx = n + i
        
        trend = intercept + slope * future_idx
        season = seasonal_effects.get(future_date.month, 0)
        prediction = max(0, int(trend + season))
        
        # Simple Confidence Interval (95%)
        std_dev = np.std(df['residual'])
        forecast_rows.append({
            "date": future_date,
            "predicted": prediction,
            "lower": max(0, int(prediction - 1.96 * std_dev)),
            "upper": int(prediction + 1.96 * std_dev),
            "is_forecast": True
        })
        
    return pd.DataFrame(forecast_rows)
def calculate_elasticity(df, factor="fuel_price"):
    """Determines how sensitive sales are to external factors like Fuel."""
    if factor not in df.columns or df.empty:
        return 0.0, "Missing Data"
        
    correlation = df['sales'].corr(df[factor])
    
    # Classification Logic
    if abs(correlation) < 0.3:
        status = "Inelastic (Hedged)"
    elif correlation <= -0.3:
        status = "Negative Correlation (Exposed)"
    else:
        status = "Positive Correlation (Pro-Cyclical)"
        
    return correlation, status
def calculate_order_recommendation(forecast_df, lead_time_weeks=2, safety_stock_factor=1.5):
    """
    Calculates how much a warehouse manager should order from suppliers.
    Logic: (Average Weekly Forecast * Lead Time) + Safety Stock
    """
    if forecast_df.empty:
        return 0, 0
    
    # 1. Expected demand during the lead time
    demand_during_lead_time = forecast_df['predicted'].iloc[:lead_time_weeks].sum()
    
    # 2. Safety Stock (Buffer for volatility)
    # Using the standard deviation of the forecast (Upper - Predicted)
    volatility = (forecast_df['upper'] - forecast_df['predicted']).mean()
    safety_stock = int(volatility * safety_stock_factor)
    
    total_requirement = int(demand_during_lead_time + safety_stock)
    
    return total_requirement, safety_stock