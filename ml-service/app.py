"""
Python ML Service con TensorFlow para predicciones financieras
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import tensorflow as tf
from tensorflow import keras
from sklearn.preprocessing import StandardScaler
import pickle
import os

app = Flask(__name__)
CORS(app)

# Configuración
MODEL_PATH = 'models/finance_predictor.h5'
SCALER_PATH = 'models/scaler.pkl'

class FinancePredictorModel:
    def __init__(self):
        self.model = None
        self.scaler = StandardScaler()
        self.is_trained = False
        
    def build_model(self, input_shape):
        """Construir red neuronal LSTM para predicción de series temporales"""
        model = keras.Sequential([
            keras.layers.LSTM(64, return_sequences=True, input_shape=input_shape),
            keras.layers.Dropout(0.2),
            keras.layers.LSTM(32, return_sequences=False),
            keras.layers.Dropout(0.2),
            keras.layers.Dense(16, activation='relu'),
            keras.layers.Dense(1)
        ])
        
        model.compile(
            optimizer='adam',
            loss='mse',
            metrics=['mae']
        )
        
        return model
    
    def prepare_data(self, transactions):
        """Preparar datos de transacciones para el modelo"""
        if not transactions or len(transactions) < 5:
            return None, None
        
        # Convertir a DataFrame
        df = pd.DataFrame(transactions)
        df['date'] = pd.to_datetime(df['date'])
        df = df.sort_values('date')
        
        # Crear features temporales
        df['day_of_week'] = df['date'].dt.dayofweek
        df['day_of_month'] = df['date'].dt.day
        df['month'] = df['date'].dt.month
        df['is_weekend'] = df['day_of_week'].isin([5, 6]).astype(int)
        
        # Categorías one-hot encoding
        category_dummies = pd.get_dummies(df['category'], prefix='cat')
        df = pd.concat([df, category_dummies], axis=1)
        
        # Agregar por día
        daily_data = df.groupby(df['date'].dt.date).agg({
            'amount': ['sum', 'count', 'mean'],
        }).reset_index()
        
        daily_data.columns = ['date', 'total_amount', 'transaction_count', 'avg_amount']
        
        return df, daily_data
    
    def create_sequences(self, data, sequence_length=7):
        """Crear secuencias para LSTM"""
        sequences = []
        targets = []
        
        for i in range(len(data) - sequence_length):
            seq = data[i:i+sequence_length]
            target = data[i+sequence_length]
            sequences.append(seq)
            targets.append(target)
        
        return np.array(sequences), np.array(targets)
    
    def train_model(self, transactions, epochs=50):
        """Entrenar modelo con datos históricos"""
        df, daily_data = self.prepare_data(transactions)
        
        if daily_data is None or len(daily_data) < 14:
            return False
        
        # Preparar datos para entrenamiento
        features = daily_data[['total_amount', 'transaction_count', 'avg_amount']].values
        features_scaled = self.scaler.fit_transform(features)
        
        # Crear secuencias
        X, y = self.create_sequences(features_scaled, sequence_length=7)
        
        if len(X) < 5:
            return False
        
        # Dividir en train/test
        split = int(0.8 * len(X))
        X_train, X_test = X[:split], X[split:]
        y_train, y_test = y[:split], y[split:]
        
        # Construir y entrenar modelo
        self.model = self.build_model((X_train.shape[1], X_train.shape[2]))
        
        history = self.model.fit(
            X_train, y_train,
            validation_data=(X_test, y_test),
            epochs=epochs,
            batch_size=8,
            verbose=0
        )
        
        self.is_trained = True
        
        # Guardar modelo
        os.makedirs('models', exist_ok=True)
        self.model.save(MODEL_PATH)
        with open(SCALER_PATH, 'wb') as f:
            pickle.dump(self.scaler, f)
        
        return True
    
    def load_model(self):
        """Cargar modelo pre-entrenado"""
        try:
            if os.path.exists(MODEL_PATH) and os.path.exists(SCALER_PATH):
                self.model = keras.models.load_model(MODEL_PATH)
                with open(SCALER_PATH, 'rb') as f:
                    self.scaler = pickle.load(f)
                self.is_trained = True
                return True
        except Exception as e:
            print(f"Error cargando modelo: {e}")
        return False
    
    def predict_next_days(self, transactions, days=30):
        """Predecir gastos para los próximos N días"""
        df, daily_data = self.prepare_data(transactions)
        
        if daily_data is None or len(daily_data) < 7:
            # Fallback a predicción simple
            return self._simple_prediction(transactions, days)
        
        # Entrenar si no está entrenado
        if not self.is_trained:
            success = self.train_model(transactions)
            if not success:
                return self._simple_prediction(transactions, days)
        
        # Preparar últimos datos
        features = daily_data[['total_amount', 'transaction_count', 'avg_amount']].values
        features_scaled = self.scaler.transform(features)
        
        # Usar últimos 7 días para predecir
        last_sequence = features_scaled[-7:].reshape(1, 7, 3)
        
        predictions = []
        current_sequence = last_sequence.copy()
        
        for _ in range(days):
            pred = self.model.predict(current_sequence, verbose=0)
            predictions.append(pred[0])
            
            # Actualizar secuencia
            current_sequence = np.roll(current_sequence, -1, axis=1)
            current_sequence[0, -1, :] = pred[0]
        
        # Desnormalizar predicciones
        predictions = np.array(predictions)
        predictions_denorm = self.scaler.inverse_transform(predictions)
        
        return {
            'daily_predictions': predictions_denorm[:, 0].tolist(),
            'total_predicted': float(np.sum(predictions_denorm[:, 0]))
        }
    
    def _simple_prediction(self, transactions, days):
        """Predicción simple basada en promedios"""
        df = pd.DataFrame(transactions)
        expenses = df[df['type'] == 'expense']
        
        if len(expenses) == 0:
            return {'daily_predictions': [0] * days, 'total_predicted': 0}
        
        daily_avg = abs(expenses['amount'].mean())
        
        return {
            'daily_predictions': [daily_avg] * days,
            'total_predicted': float(daily_avg * days)
        }

# Instancia global del modelo
predictor = FinancePredictorModel()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'OK',
        'model_trained': predictor.is_trained,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/predict', methods=['POST'])
def predict():
    """Endpoint principal de predicción"""
    try:
        data = request.json
        transactions = data.get('transactions', [])
        days = data.get('days', 30)
        
        if not transactions:
            return jsonify({'error': 'No transactions provided'}), 400
        
        # Realizar predicción
        predictions = predictor.predict_next_days(transactions, days)
        
        # Calcular métricas adicionales
        df = pd.DataFrame(transactions)
        expenses = df[df['type'] == 'expense']
        income = df[df['type'] == 'income']
        
        total_expenses_historical = abs(expenses['amount'].sum()) if len(expenses) > 0 else 0
        total_income_historical = income['amount'].sum() if len(income) > 0 else 0
        current_balance = total_income_historical - total_expenses_historical
        
        # Calcular nivel de riesgo
        predicted_expenses = predictions['total_predicted']
        expense_ratio = predicted_expenses / total_income_historical if total_income_historical > 0 else 1
        
        if expense_ratio > 0.9:
            risk_level = 'alto'
        elif expense_ratio > 0.7:
            risk_level = 'medio'
        else:
            risk_level = 'bajo'
        
        # Balance proyectado
        avg_monthly_income = total_income_historical / max(1, len(transactions) // 30)
        predicted_balance = current_balance + avg_monthly_income - predicted_expenses
        
        # Meta de ahorro sugerida
        savings_goal = max(500, avg_monthly_income * 0.2)
        
        response = {
            'predictions': predictions,
            'predictedMonthlyExpense': float(predicted_expenses),
            'predictedBalance': float(predicted_balance),
            'currentBalance': float(current_balance),
            'riskLevel': risk_level,
            'savingsGoal': float(savings_goal),
            'statistics': {
                'totalExpensesHistorical': float(total_expenses_historical),
                'totalIncomeHistorical': float(total_income_historical),
                'averageMonthlyIncome': float(avg_monthly_income),
                'expenseRatio': float(expense_ratio)
            },
            'model_info': {
                'trained': predictor.is_trained,
                'prediction_method': 'lstm' if predictor.is_trained else 'simple_average'
            }
        }
        
        return jsonify(response)
    
    except Exception as e:
        print(f"Error en predicción: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/train', methods=['POST'])
def train():
    """Endpoint para entrenar el modelo con nuevos datos"""
    try:
        data = request.json
        transactions = data.get('transactions', [])
        epochs = data.get('epochs', 50)
        
        if not transactions or len(transactions) < 14:
            return jsonify({'error': 'Need at least 14 transactions to train'}), 400
        
        success = predictor.train_model(transactions, epochs)
        
        if success:
            return jsonify({
                'message': 'Model trained successfully',
                'trained': True
            })
        else:
            return jsonify({'error': 'Training failed'}), 500
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/category-insights', methods=['POST'])
def category_insights():
    """Análisis de gastos por categoría"""
    try:
        data = request.json
        transactions = data.get('transactions', [])
        
        df = pd.DataFrame(transactions)
        expenses = df[df['type'] == 'expense']
        
        if len(expenses) == 0:
            return jsonify({'insights': []})
        
        # Análisis por categoría
        category_stats = expenses.groupby('category').agg({
            'amount': ['sum', 'count', 'mean']
        }).reset_index()
        
        category_stats.columns = ['category', 'total', 'count', 'average']
        category_stats['total'] = abs(category_stats['total'])
        category_stats['average'] = abs(category_stats['average'])
        category_stats = category_stats.sort_values('total', ascending=False)
        
        insights = []
        total_expenses = category_stats['total'].sum()
        
        for _, row in category_stats.iterrows():
            percentage = (row['total'] / total_expenses * 100) if total_expenses > 0 else 0
            insights.append({
                'category': row['category'],
                'total': float(row['total']),
                'count': int(row['count']),
                'average': float(row['average']),
                'percentage': float(percentage)
            })
        
        return jsonify({'insights': insights})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Intentar cargar modelo existente
    predictor.load_model()
    
    print("🐍 Servicio Python ML iniciado")
    print(f"🤖 Modelo cargado: {predictor.is_trained}")
    print("📊 TensorFlow version:", tf.__version__)
    
    app.run(host='0.0.0.0', port=5000, debug=True)
