"""Unit tests for the analysis caching gate (serve.py).

Pure-logic tests: no subprocess, no server boot. We point serve.ANALYSES_DIR
at a temp dir and exercise the gate that decides whether a daily/weekly
analysis should be (re)generated — and therefore whether a new headless
Claude session gets minted.

Run: python3 tests/test_analysis_cache.py
"""
import importlib.util
import tempfile
import time
import unittest
from pathlib import Path

# Import serve.py as a module without running main() (guarded by __main__).
_SERVE = Path(__file__).resolve().parent.parent / "serve.py"
_spec = importlib.util.spec_from_file_location("tribbles_serve", _SERVE)
serve = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(serve)


class AnalysisCacheGate(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        # Redirect all analysis I/O at the temp dir for the duration of the test.
        serve.ANALYSES_DIR = self.dir

    def tearDown(self):
        self._tmp.cleanup()

    def _write_success(self, key):
        (self.dir / f"{key}.json").write_text("{}")

    def test_no_cache_means_not_blocked(self):
        # Cold cache: generation must be allowed (this is the legit first run).
        self.assertFalse(serve._analysis_blocked("2026-05-17_2026-05-17"))

    def test_successful_cache_blocks_forever(self):
        key = "2026-05-17_2026-05-17"
        self._write_success(key)
        self.assertTrue(serve._analysis_blocked(key))

    def test_failure_is_negative_cached_within_cooldown(self):
        # The core fix: a failed generation must NOT re-mint a session on the
        # next dashboard load. Recording a failure blocks within the cooldown.
        key = "2026-05-18_2026-05-18"
        self.assertFalse(serve._analysis_blocked(key))
        serve._record_analysis_failure(key)
        self.assertTrue(serve._analysis_blocked(key))

    def test_failure_marker_expires_after_cooldown(self):
        # Self-healing: once the cooldown passes, exactly one retry is allowed.
        key = "2026-05-19_2026-05-19"
        serve._record_analysis_failure(key)
        # Backdate the marker beyond the cooldown.
        stale = time.time() - serve.ANALYSIS_FAIL_COOLDOWN - 1
        (self.dir / f"{key}.failed").write_text(str(stale))
        self.assertFalse(serve._analysis_blocked(key))

    def test_success_clears_prior_failure_marker(self):
        # A later success should remove the negative-cache so it doesn't linger.
        key = "2026-05-20_2026-05-20"
        serve._record_analysis_failure(key)
        self.assertTrue((self.dir / f"{key}.failed").exists())
        serve._clear_analysis_failure(key)
        self.assertFalse((self.dir / f"{key}.failed").exists())

    def test_failure_markers_not_served_as_analyses(self):
        # Failure markers must not use the *.json glob the API serves from.
        key = "2026-05-21_2026-05-21"
        serve._record_analysis_failure(key)
        served = list(self.dir.glob("*.json"))
        self.assertEqual(served, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
