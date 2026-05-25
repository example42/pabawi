#!/usr/bin/env python3
"""
Convert camelCase column references inside SQL string literals to snake_case.

Only operates inside string literals (`...`, "...", '...') that contain SQL
keywords. Outside strings (TS field accesses, types, variable names) are
untouched.

This script was written to migrate test fixtures that duplicate the schema
with camelCase columns. After running it on a test file, manually verify
the diff.
"""
import re
import sys

CAMEL_TO_SNAKE = {
    "passwordHash": "password_hash",
    "firstName": "first_name",
    "lastName": "last_name",
    "isActive": "is_active",
    "isAdmin": "is_admin",
    "createdAt": "created_at",
    "updatedAt": "updated_at",
    "lastLoginAt": "last_login_at",
    "isBuiltIn": "is_built_in",
    "userId": "user_id",
    "roleId": "role_id",
    "groupId": "group_id",
    "permissionId": "permission_id",
    "assignedAt": "assigned_at",
    "revokedAt": "revoked_at",
    "expiresAt": "expires_at",
    "attemptedAt": "attempted_at",
    "ipAddress": "ip_address",
    "lockoutType": "lockout_type",
    "lockedAt": "locked_at",
    "lockedUntil": "locked_until",
    "failedAttempts": "failed_attempts",
    "lastAttemptAt": "last_attempt_at",
    "cumulativeFailedAttempts": "cumulative_failed_attempts",
    "lastFailedAt": "last_failed_at",
    "eventType": "event_type",
    "targetUserId": "target_user_id",
    "targetResourceType": "target_resource_type",
    "targetResourceId": "target_resource_id",
    "userAgent": "user_agent",
    "nodeId": "node_id",
    "nodeUri": "node_uri",
}

SQL_KEYWORDS = re.compile(
    r"\b(INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE\s+\w+|SELECT\s+|DELETE\s+FROM|"
    r"CREATE\s+TABLE|CREATE\s+INDEX|CREATE\s+UNIQUE\s+INDEX|ALTER\s+TABLE|"
    r"FROM\s+\w+)",
    re.IGNORECASE,
)


def replace_in_sql(s: str) -> str:
    """Replace camelCase column refs with snake_case, but preserve alias
    targets in `AS "..."` (those are the camelCase TS interface fields and
    must stay as-is).
    """
    # Find all `AS "..."` segments and protect their content from rewrite.
    # Strategy: replace each match with a placeholder, do the global rewrite,
    # then restore.
    placeholders: list[str] = []

    def stash(m: "re.Match[str]") -> str:
        placeholders.append(m.group(0))
        return f"__AS_ALIAS_{len(placeholders) - 1}__"

    protected = re.sub(r'\bAS\s+"[^"]+"', stash, s, flags=re.IGNORECASE)

    out = protected
    for camel, snake in CAMEL_TO_SNAKE.items():
        out = re.sub(rf"\b{camel}\b", snake, out)

    # Restore the AS "..." segments verbatim.
    for i, original in enumerate(placeholders):
        out = out.replace(f"__AS_ALIAS_{i}__", original)

    return out


def process(text: str) -> str:
    out = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch in ("`", '"', "'"):
            quote = ch
            i += 1
            buf = [ch]
            while i < n:
                c = text[i]
                if c == "\\":
                    buf.append(c)
                    if i + 1 < n:
                        buf.append(text[i + 1])
                        i += 2
                        continue
                    i += 1
                    continue
                if c == "$" and quote == "`" and i + 1 < n and text[i + 1] == "{":
                    buf.append(c)
                    buf.append("{")
                    i += 2
                    depth = 1
                    while i < n and depth > 0:
                        cc = text[i]
                        if cc == "{":
                            depth += 1
                        elif cc == "}":
                            depth -= 1
                        buf.append(cc)
                        i += 1
                    continue
                buf.append(c)
                if c == quote:
                    i += 1
                    break
                i += 1
            literal = "".join(buf)
            if SQL_KEYWORDS.search(literal):
                literal = replace_in_sql(literal)
            out.append(literal)
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "/":
            j = text.find("\n", i)
            if j < 0:
                out.append(text[i:])
                i = n
            else:
                out.append(text[i:j + 1])
                i = j + 1
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            if j < 0:
                out.append(text[i:])
                i = n
            else:
                out.append(text[i:j + 2])
                i = j + 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


if __name__ == "__main__":
    for path in sys.argv[1:]:
        with open(path, "r") as f:
            src = f.read()
        new = process(src)
        if new != src:
            with open(path, "w") as f:
                f.write(new)
            print(f"updated: {path}")
        else:
            print(f"unchanged: {path}")
