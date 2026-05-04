# ML Decision Space

## Purpose

ML Space is an advisory decision-quality assistant for pricing decisions. It is separate from Math Space.

- **Math Space** explains price response using transparent demand models, simulations, recommendations, formulas, and reliability guards.
- **ML Space** checks whether a pricing decision resembles historical decision patterns classified as `Terrible`, `Bad`, `Neutral`, `Good`, or `Terrific`.
- The safest business use is to combine both: Math Space explains what may happen, while ML Space gives a second-opinion risk signal.

## How To Train

Run the offline training pipeline from the project root:

```bash
npm run ml:train
```

The pipeline reads `C:\Users\PRANAY\OneDrive\Documents\Dataset_ML.zip` by default and writes artifacts to:

```text
generated/ml/
```

Main generated files:

- `pricing_decision_training_dataset.csv`
- `pricing_decision_dataset_profile.json`
- `decision_quality_model.joblib`
- `decision_quality_metrics.json`
- `decision_quality_feature_importance.csv`

These files are local generated artifacts and are intentionally ignored by Git.

## FRED Macro Data

To enrich the training dataset with macroeconomic indicators, add this to a local `.env` file:

```text
FRED_API_KEY=your-regenerated-fred-key
```

Never commit a real FRED key. If a key was exposed in screenshots or chat, regenerate it before final submission.

## Current Role In The App

ML Space is not an autonomous pricing engine. It does not replace the mathematical recommendation system.

Use ML Space to:

- test one proposed pricing decision,
- classify the decision quality,
- view confidence / vote strength,
- review top influencing signals,
- explain that the system has both transparent math and learned decision support.

## Important Limitations

- Public datasets do not contain official company labels for good or bad decisions; labels are engineered from before/after business outcomes.
- Macro indicators are only populated after training with a valid FRED API key.
- ML predictions are advisory and should not approve price changes without business review.
