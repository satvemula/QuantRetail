This is written in high-density Markdown, focusing on the **Order Recommendation** and **Elasticity** logic that makes the project "Professional Grade."

```markdown
# Demand Intel | Quantitative Inventory Management 📊

An interactive decision-support system built for retail merchants and warehouse managers. This project utilizes exogenous macro-economic drivers to forecast demand and generate automated procurement recommendations.

## 🚀 Business Case
In global trade and retail (e.g., the Cargill energy/commodity complex), inventory risk is driven by more than just historical trends. This system models the **Bullwhip Effect** by correlating retail sales with macro-economic indicators like Fuel Prices (Logistics Costs) and CPI (Consumer Purchasing Power).

## 🧠 Technical Logic

### 1. Demand Forecasting
The engine utilizes a seasonal-trend decomposition model:
$$Sales_t = Trend_t + Seasonality_t + \epsilon_t$$
- **Trend**: Calculated via linear regression of historical windows.
- **Seasonality**: Modeled as monthly residuals to capture cyclical retail peaks.

### 2. Merchant Intelligence (Elasticity)
The system calculates the **Pearson Correlation Coefficient** ($r$) between sales and macro-drivers:
$$r = \frac{\sum (x_i - \bar{x})(y_i - \bar{y})}{\sqrt{\sum (x_i - \bar{x})^2 \sum (y_i - \bar{y})^2}}$$
This identifies if a product is **Inelastic** (Hedged) or **Exposed** to market shocks.

### 3. Warehouse Procurement (ROQ)
The **Recommended Order Quantity** accounts for supplier lead times and statistical safety stock:
$$ROQ = (Average\ Demand \times Lead\ Time) + (Z \times \sigma_{LT})$$
Where $Z$ is the "Safety Stock Aggression" factor selected by the user.



## 🛠️ Tech Stack
- **Language**: Python 3.12
- **Framework**: Streamlit (Dashboard UI)
- **Analytics**: NumPy & Pandas
- **Visualization**: Plotly Graph Objects (Interactive Financial Charts)

## 📦 Installation & Usage
1. Clone the repository:
   ```bash
   git clone [https://github.com/yourusername/QuantRetail.git](https://github.com/yourusername/QuantRetail.git)

```

2. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate

```


3. Install dependencies:
```bash
pip install -r requirements.txt

```


4. Run the application:
```bash
streamlit run app.py

```




