import uvicorn

if __name__ == "__main__":
    print("Starting OW Analyzer Runner League API Server...")

    uvicorn.run("ow_analyzer_runnerleague.app:app", host="0.0.0.0", port=8000, reload=True)
