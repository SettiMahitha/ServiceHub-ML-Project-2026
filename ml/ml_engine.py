#!/usr/bin/env python3
"""Service Hub demo ML engine.
Models:
1) TF-IDF + LogisticRegression service text classifier
2) RandomForestRegressor demand-score predictor
3) RandomForestClassifier technician fit scorer
The bundled examples are synthetic/demo data, not production-grade training data.
"""
import json
import sys
import warnings
warnings.filterwarnings("ignore")

def train_models():
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline
    from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
    import numpy as np

    examples = [
      ("tap is leaking water from kitchen sink", "plumbing"),
      ("pipe burst and water is coming out", "plumbing"),
      ("need bathroom tap and shower fitting", "plumbing"),
      ("water tank pipe has a leak", "plumbing"),
      ("electric switch is sparking", "electrical"),
      ("fan is not working and light flickers", "electrical"),
      ("need new wiring in one room", "electrical"),
      ("short circuit in house", "electrical"),
      ("door hinge is broken", "carpentry"),
      ("wooden table and cupboard repair", "carpentry"),
      ("need a carpenter for furniture", "carpentry"),
      ("repair my bed frame", "carpentry"),
      ("clean my full house", "cleaning"),
      ("kitchen needs deep cleaning", "cleaning"),
      ("bathroom floor and tiles are dirty", "cleaning"),
      ("sofa cleaning service required", "cleaning"),
      ("washing machine is not spinning", "appliance"),
      ("refrigerator is not cooling", "appliance"),
      ("fridge making unusual noise", "appliance"),
      ("microwave oven is not heating", "appliance"),
      ("paint the walls of my bedroom", "painting"),
      ("need interior wall painting", "painting"),
      ("wall paint is peeling off", "painting"),
      ("paint exterior of the house", "painting"),
      ("air conditioner is not cooling", "ac"),
      ("AC needs servicing and gas check", "ac"),
      ("split AC installation needed", "ac"),
      ("air conditioner leaking water", "ac"),
      ("termites in wooden furniture", "pest"),
      ("cockroaches in kitchen", "pest"),
      ("need pest control at home", "pest"),
      ("ants and mosquitoes in house", "pest"),
    ]
    texts, labels = zip(*examples)
    classifier = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1,2), lowercase=True)),
        ("model", LogisticRegression(max_iter=1000, random_state=42))
    ])
    classifier.fit(texts, labels)

    # Reproducible illustrative synthetic monthly/day-of-week demand examples.
    rng = np.random.RandomState(42)
    Xd, yd = [], []
    category_base = {"plumbing": 55, "electrical": 52, "carpentry": 30, "cleaning": 68,
                     "appliance": 46, "painting": 26, "ac": 62, "pest": 35}
    for category, base in category_base.items():
        for month in range(1, 13):
            for weekday in range(7):
                seasonal = 14 if category == "ac" and month in [4,5,6,7,8] else 0
                seasonal += 8 if category == "pest" and month in [6,7,8,9] else 0
                seasonal += 6 if category == "cleaning" and month in [10,11,12] else 0
                weekend = 5 if weekday in [0,6] else 0
                Xd.append([list(category_base).index(category), month, weekday])
                yd.append(max(0, min(100, base + seasonal + weekend + rng.normal(0, 5))))
    demand = RandomForestRegressor(n_estimators=120, random_state=42, min_samples_leaf=2)
    demand.fit(np.array(Xd), np.array(yd))

    # Synthetic preference/fit data to learn a technician match score.
    Xt, yt = [], []
    for _ in range(1400):
        cat_match = rng.randint(0, 2)
        loc_match = rng.randint(0, 2)
        rating = rng.uniform(2.5, 5.0)
        exp = rng.randint(0, 21)
        available = rng.randint(0, 2)
        verified = rng.randint(0, 2)
        # Labels represent a synthetic suitability rule for demonstration only.
        score = (cat_match*0.36 + loc_match*0.17 + (rating/5)*0.18 +
                 min(exp,15)/15*0.12 + available*0.10 + verified*0.07)
        label = 1 if score >= 0.57 else 0
        Xt.append([cat_match, loc_match, rating, exp, available, verified])
        yt.append(label)
    recommender = RandomForestClassifier(n_estimators=100, random_state=42, min_samples_leaf=3)
    recommender.fit(np.array(Xt), np.array(yt))
    return classifier, demand, recommender, list(category_base.keys())

def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        mode = sys.argv[1] if len(sys.argv) > 1 else ""
        classifier, demand_model, recommender, categories = train_models()
        if mode == "classify":
            text = str(payload.get("text", "")).strip()
            if len(text) < 3:
                raise ValueError("Please enter a short description of the service problem.")
            probs = classifier.predict_proba([text])[0]
            ix = int(probs.argmax())
            category = str(classifier.classes_[ix])
            names = {"plumbing":"Plumbing","electrical":"Electrical","carpentry":"Carpentry",
                     "cleaning":"Home Cleaning","appliance":"Appliance Repair","painting":"Painting",
                     "ac":"AC Service","pest":"Pest Control"}
            print(json.dumps({"category":category,"categoryName":names.get(category,category),
                              "confidence":float(probs[ix]),"model":"TF-IDF + Logistic Regression",
                              "note":"Confidence is based on a small demo dataset; review the prediction before booking."}))
        elif mode == "demand":
            category = str(payload.get("category","plumbing"))
            if category not in categories: category = "plumbing"
            month = int(payload.get("month", 1))
            weekday = int(payload.get("weekday", 0))
            pred = float(demand_model.predict([[categories.index(category), month, weekday]])[0])
            print(json.dumps({"prediction":round(max(0,min(100,pred)),1),
                              "model":"Random Forest Regressor",
                              "note":"Illustrative demand score trained on synthetic seasonal examples, not real historical bookings."}))
        elif mode == "recommend":
            category = str(payload.get("category","plumbing"))
            location = str(payload.get("location","")).strip().lower()
            candidates = payload.get("candidates", [])
            scored = []
            for p in candidates:
                cat_match = int(p.get("serviceType") == category)
                loc_match = int(not location or p.get("location","").lower() == location or
                                any(str(a).lower() == location for a in p.get("serviceAreas", [])))
                # Node currently passes provider location but not serviceAreas; location fit remains conservative.
                rating = float(p.get("rating",0) or 0)
                exp = int(p.get("experience",0) or 0)
                available = int(bool(p.get("available", True)))
                verified = int(bool(p.get("verified", False)))
                prob = float(recommender.predict_proba([[cat_match, loc_match, rating, exp, available, verified]])[0][1])
                # Keep exact category match prominent so unrelated providers aren't ranked above specialists.
                final_score = min(1.0, prob*0.7 + cat_match*0.3)
                scored.append({"id":p.get("id"),"name":p.get("name"),"serviceType":p.get("serviceType"),
                               "location":p.get("location"),"experience":exp,"rating":rating,
                               "score":round(final_score,3)})
            scored.sort(key=lambda x:(x["score"],x["rating"],x["experience"]),reverse=True)
            print(json.dumps({"recommendations":scored[:5],"model":"Random Forest Classifier",
                              "note":"Ranking uses a demo model trained on synthetic fit labels; verify provider suitability manually."}))
        else:
            raise ValueError("Unknown ML mode.")
    except Exception as exc:
        print(json.dumps({"error":str(exc)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
