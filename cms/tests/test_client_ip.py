"""The visitor's IP behind Coolify's proxy and Cloudflare (pb_hooks/client_ip.pb.js), seen through
the sign-in rate limit: 2 attempts per 3 s per IP, so a third attempt from the same visitor gets
429. Each test uses its own addresses so their counters do not mix."""

import time

from pb_helpers import SUPERUSER

AUTH = "/api/collections/_superusers/auth-with-password"
# a wrong password on purpose: these attempts only exist to hit the rate limit
WRONG = {"identity": "nobody@example.org", "password": "-".join(["not", "the", "password"])}


def attempts(pb, headers_list):
    return [pb.call("POST", AUTH, WRONG, headers=h)[0] for h in headers_list]


def test_cloudflare_header_counts_only_when_the_request_comes_from_cloudflare(pb):
    time.sleep(3.1)
    # from a Cloudflare address: the visitor in CF-Connecting-IP is what counts
    cf = {"X-Forwarded-For": "203.0.113.50, 172.64.10.1"}
    same = attempts(pb, [{**cf, "CF-Connecting-IP": "203.0.113.50"}] * 3)
    assert same[-1] == 429 and 429 not in same[:2]
    other = attempts(pb, [{**cf, "CF-Connecting-IP": "203.0.113.51"}])
    assert other == [400], "a different visitor behind the same Cloudflare node is not limited"


def test_cloudflare_over_ipv6(pb):
    time.sleep(3.1)
    cf6 = {"X-Forwarded-For": "2606:4700:10::1"}
    assert attempts(pb, [{**cf6, "CF-Connecting-IP": "2001:db8::7"}] * 3)[-1] == 429
    assert attempts(pb, [{**cf6, "CF-Connecting-IP": "2001:db8::8"}]) == [400]


def test_faked_headers_from_elsewhere_are_ignored(pb):
    time.sleep(3.1)
    # straight to the server (not Cloudflare): changing CF-Connecting-IP or our own header
    # must not dodge the limit
    direct = "198.51.100.23"
    statuses = attempts(
        pb,
        [
            {"X-Forwarded-For": direct, "CF-Connecting-IP": "192.0.2.1", "X-Grid-Client-IP": "192.0.2.1"},
            {"X-Forwarded-For": direct, "CF-Connecting-IP": "192.0.2.2", "X-Grid-Client-IP": "192.0.2.2"},
            {"X-Forwarded-For": direct, "CF-Connecting-IP": "192.0.2.3", "X-Grid-Client-IP": "192.0.2.3"},
        ],
    )
    assert statuses[-1] == 429


def test_signed_in_answers_are_never_cacheable(pb, admin):
    _, _, guest = pb.call("GET", "/api/collections/news/records?perPage=1")
    _, _, signed_in = pb.call("GET", "/api/collections/news/records?perPage=1", token=admin)
    assert guest.get("Cache-Control") == "public, max-age=60"
    assert signed_in.get("Cache-Control") == "private, no-store"


def test_superuser_can_still_sign_in(pb):
    time.sleep(3.1)
    status, body, _ = pb.call("POST", AUTH, {"identity": SUPERUSER[0], "password": SUPERUSER[1]}, headers={"X-Forwarded-For": "198.51.100.99"})
    assert status == 200, body
