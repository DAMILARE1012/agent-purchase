"""Approving a payment with an email code: no Redis, SMTP or database (an in-memory stand-in and a captured mailer)."""

import json
import re
from types import SimpleNamespace

import pytest

from app.errors import ApiError
from app.services import email_approval


class FakeRedis:
    def __init__(self):
        self.data: dict[str, str] = {}

    def get(self, key):
        return self.data.get(key)

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.data:
            return None
        self.data[key] = str(value)
        return True

    def delete(self, *keys):
        return sum(1 for k in keys if self.data.pop(k, None) is not None)

    def incr(self, key):
        self.data[key] = str(int(self.data.get(key, 0)) + 1)
        return int(self.data[key])

    def expire(self, *_args, **_kwargs):
        return True


@pytest.fixture
def env(monkeypatch):
    redis, sent = FakeRedis(), []
    monkeypatch.setattr(email_approval, "get_redis", lambda: redis)
    monkeypatch.setattr(email_approval.mailer, "configured", lambda: True)
    monkeypatch.setattr(email_approval.mailer, "send", lambda to, subject, text, html=None: sent.append({"to": to, "subject": subject, "text": text}))
    viewer = SimpleNamespace(user=SimpleNamespace(id="u1", email="sam@example.com"), email_verified=True)
    return SimpleNamespace(redis=redis, sent=sent, viewer=viewer)


CART, HASH, TOTAL = "cart_1", "a" * 64, 3_850_000


def send(env, cart=CART, cart_hash=HASH, total=TOTAL):
    email_approval.send_code(env.viewer, cart, cart_hash, total, "IKEJA OFFICE HUB LTD", "Aurora Bank •••• 0048", "Ikeja Office Hub", "1 × HP 107A toner")
    return re.search(r"\b(\d{6})\b", env.sent[-1]["text"]).group(1)


def test_the_email_says_exactly_what_the_code_approves(env):
    send(env)
    mail = env.sent[-1]
    assert mail["to"] == "sam@example.com"
    assert "₦38,500" in mail["subject"] and "IKEJA OFFICE HUB LTD" in mail["subject"]
    assert "Aurora Bank •••• 0048" in mail["text"] and "1 × HP 107A toner" in mail["text"]


def test_the_right_code_approves_once_and_is_never_stored(env):
    code = send(env)
    assert code not in json.dumps(env.redis.data)  # Only a salted hash is kept.
    evidence = json.loads(email_approval.check_code(env.viewer, CART, HASH, TOTAL, code))
    assert evidence["kind"] == "email_code" and evidence["cartHash"] == HASH and code not in json.dumps(evidence)
    with pytest.raises(ApiError) as again:
        email_approval.check_code(env.viewer, CART, HASH, TOTAL, code)
    assert again.value.code == "email_code_expired"


def test_wrong_codes_count_down_then_lock(env):
    code = send(env)
    wrong = f"{(int(code) + 1) % 1_000_000:06d}"
    for left in (4, 3, 2, 1):
        with pytest.raises(ApiError) as e:
            email_approval.check_code(env.viewer, CART, HASH, TOTAL, wrong)
        assert e.value.code == "email_code_wrong" and str(left) in e.value.message
    with pytest.raises(ApiError):
        email_approval.check_code(env.viewer, CART, HASH, TOTAL, wrong)  # The fifth wrong try.
    with pytest.raises(ApiError) as locked:
        email_approval.check_code(env.viewer, CART, HASH, TOTAL, code)  # Even the right code, now.
    assert locked.value.code in ("email_code_locked", "email_code_expired")


def test_a_code_cant_approve_a_changed_cart(env):
    code = send(env)
    with pytest.raises(ApiError) as e:
        email_approval.check_code(env.viewer, CART, "b" * 64, TOTAL, code)
    assert e.value.code == "cart_changed"


def test_bigger_payments_need_a_passkey(env):
    over = email_approval.get_settings().email_approval_max_minor + 1
    assert not email_approval.availability(env.viewer, over)["available"]
    with pytest.raises(ApiError) as e:
        send(env, total=over)
    assert e.value.code == "email_code_unavailable"
    with pytest.raises(ApiError) as e:
        email_approval.check_code(env.viewer, CART, HASH, over, "123456")
    assert e.value.code == "passkey_required"


def test_new_codes_are_rate_limited(env):
    send(env)
    with pytest.raises(ApiError) as e:
        send(env)
    assert e.value.code == "email_code_too_soon"


def test_codes_only_go_to_an_address_on_file(env):
    env.viewer.user.email = None
    assert not email_approval.availability(env.viewer, TOTAL)["available"]


def test_masked_address():
    assert email_approval.mask("sam@example.com") == "s••@example.com"
    assert email_approval.mask("damilare.o@gmail.com") == "d••••••@gmail.com"
