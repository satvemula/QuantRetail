import streamlit as st
import plotly.graph_objects as go
import pandas as pd
from data_provider import get_retail_data
from forecast_engine import generate_forecast, calculate_elasticity, calculate_order_recommendation

# 1. Aesthetic Configuration
st.set_page_config(page_title="Demand Intel | QuantRetail", layout="wide")

st.markdown("""
    <style>
    .main { background-color: #0f172a; }
    div[data-testid="stMetricValue"] { color: #fbbf24; font-family: 'Courier New', monospace; }
    div[data-testid="stMetricDelta"] { color: #00e5ff; }
    .stTabs [data-baseweb="tab-list"] { gap: 8px; }
    .stTabs [data-baseweb="tab"] {
        background-color: #1e293b; border-radius: 4px 4px 0px 0px; color: #94a3b8;
    }
    .stTabs [aria-selected="true"] { background-color: #334155; color: #00e5ff; }
    </style>
    """, unsafe_allow_html=True)

# 2. Load Data
df = get_retail_data()

# 3. Sidebar Controls
with st.sidebar:
    st.title("📊 Demand Intel")
    st.write("Quantitative Inventory Management")
    st.divider()
    selected_store = st.selectbox("Select Store", df['store'].unique())
    selected_prod = st.selectbox("Select Product", df['product'].unique())
    horizon = st.slider("Forecast Horizon (Weeks)", 4, 24, 12)
    
    st.divider()
    st.header("📦 Warehouse Settings")
    on_hand = st.number_input("Current Inventory On-Hand", value=5000)
    lead_time = st.slider("Supplier Lead Time (Weeks)", 1, 4, 2)
    buffer_risk = st.select_slider("Safety Stock Aggression", 
                                   options=["Lean", "Balanced", "Aggressive"], 
                                   value="Balanced")

# 4. Processing & Calculations
subset = df[(df['store'] == selected_store) & (df['product'] == selected_prod)]
forecast = generate_forecast(subset, horizon)

# Procurement Calculations
risk_map = {"Lean": 1.0, "Balanced": 1.5, "Aggressive": 2.2}
order_qty, s_stock = calculate_order_recommendation(forecast, lead_time, risk_map[buffer_risk])
net_requirement = max(0, order_qty - on_hand)

# 5. Header Section
st.title(f"{selected_prod} // {selected_store}")
m1, m2, m3, m4 = st.columns(4)

current_sales = int(subset['sales'].iloc[-1])
prev_sales = int(subset['sales'].iloc[-2])
growth = ((current_sales - prev_sales) / prev_sales) * 100

m1.metric("CURRENT SALES", f"${current_sales:,}", f"{growth:.1f}%")
m2.metric("PURCHASE REQ", f"{net_requirement:,} units")
m3.metric("LEAD TIME", f"{lead_time} Weeks")
m4.metric("STATUS", "RESTOCK" if net_requirement > 0 else "OPTIMAL")

# 6. Main Visual Components
tab1, tab2 = st.tabs(["📈 Demand Forecast", "🚛 Warehouse Procurement"])

with tab1:
    fig = go.Figure()
    # Historical
    fig.add_trace(go.Scatter(
        x=subset['date'], y=subset['sales'], name="Historical", 
        fill='tozeroy', line=dict(color='#00e5ff', width=2),
        fillcolor='rgba(0, 229, 255, 0.1)'
    ))
    # Forecast
    fig.add_trace(go.Scatter(
        x=forecast['date'], y=forecast['predicted'], name="Forecast",
        line=dict(color='#fbbf24', width=2, dash='dot')
    ))
    fig.update_layout(
        template="plotly_dark", paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)', margin=dict(l=0, r=0, t=30, b=0),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
    )
    st.plotly_chart(fig, use_container_width=True)

with tab2:
    st.subheader("Supplier Order Recommendation")
    c1, c2, c3 = st.columns(3)
    c1.metric("GROSS REQUIREMENT", f"{order_qty:,} units", f"Incl. {s_stock} buffer")
    c2.metric("CURRENT SHORTFALL", f"{net_requirement:,} units", delta=-net_requirement, delta_color="inverse")
    c3.metric("REPLENISHMENT STATUS", "URGENT" if net_requirement > 2000 else "OPTIMAL")

    st.write("### Purchase Order Generation")
    order_summary = pd.DataFrame({
        "Metric": ["Forecasted Demand (Lead Time)", "Safety Stock Buffer", "Total Gross Needed", "Minus On-Hand", "FINAL PURCHASE ORDER"],
        "Quantity": [order_qty - s_stock, s_stock, order_qty, -on_hand, net_requirement]
    })
    st.table(order_summary)

# 7. Intelligence Section
st.divider()
st.subheader("🛠️ Merchant Intelligence")
col_a, col_b = st.columns(2)

with col_a:
    st.write("**Macro Exposure**")
    fuel_corr, fuel_status = calculate_elasticity(subset, "fuel_price")
    st.info(f"Fuel Price Sensitivity: {fuel_corr:.2f}")
    st.caption(f"Market Sentiment: {fuel_status}")

with col_b:
    st.write("**Inventory Alerts**")
    mean_val = subset['sales'].mean()
    std_val = subset['sales'].std()
    anomalies = subset[subset['sales'] > mean_val + (2 * std_val)]
    if not anomalies.empty:
        st.warning(f"Detected {len(anomalies)} statistical anomalies.")
    else:
        st.success("No supply chain shocks detected.")