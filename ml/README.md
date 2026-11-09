# Service Hub ML models

This folder adds three ML demos to the existing Node.js app:

1. **Service classification** — TF-IDF + Logistic Regression.
2. **Service demand prediction** — Random Forest Regressor.
3. **Technician recommendation** — Random Forest Classifier scoring candidate-provider fit.

## Setup (Windows)

1. Install Python 3.10+ and ensure `python` works in Command Prompt.
2. Open Command Prompt inside the `ServiceHub` folder.
3. Run:
   ```bat
   python -m pip install -r ml\requirements.txt
   ```
4. Start the app with `start.bat` or `node server.js`.
5. Open `http://localhost:3000` and select **ML Lab** from the navigation.

If the Python command on your machine is `py`, run `set PYTHON=py` before starting Node, or change the `PYTHON` environment variable to the correct executable path.

## API endpoints

- `GET /api/ml/status`
- `POST /api/ml/classify` with `{ "text": "My AC is not cooling" }`
- `POST /api/ml/demand` with `{ "category": "ac", "month": 6, "weekday": 2 }`
- `POST /api/ml/recommend-technician` with `{ "category": "plumbing", "location": "Gudlavalleru" }`

## Important limitation

The text classifier uses a small bundled set of labeled example sentences. The demand and technician models use synthetic demonstration data. This is enough to demonstrate an end-to-end ML integration for a prototype, but it is **not evidence of real-world accuracy**. For a final academic evaluation, collect/obtain suitable data, split it into training and test sets, and report appropriate metrics. The current app returns demo predictions and labels them accordingly.
