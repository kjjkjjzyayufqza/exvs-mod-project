from identity_lib import assert_bytes_equal, first_diff


def test_first_diff_empty_when_equal():
    assert first_diff(b"abc", b"abc") == ""


def test_assert_bytes_equal_rejects_mismatch():
    try:
        assert_bytes_equal(b"abc", b"abd", "demo")
    except AssertionError as exc:
        message = str(exc)
        assert "demo:" in message
        assert "offset 2" in message
        assert "original=0x63" in message
        assert "fast=0x64" in message
        return
    raise AssertionError("expected mismatch to raise AssertionError")


def test_assert_bytes_equal_rejects_length_mismatch():
    try:
        assert_bytes_equal(b"ab", b"abc", "len")
    except AssertionError as exc:
        assert "common prefix" in str(exc)
        return
    raise AssertionError("expected length mismatch to raise AssertionError")
