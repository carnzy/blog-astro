---
title: Web 安全最佳实践 — 从 CSP 到 DDoS 防护
published: 2026-05-25
description: 系统地介绍 Web 应用常见的安全威胁和防护策略，包括 XSS、CSRF、DDoS 攻击防范、安全头配置等。
tags: [安全, Web, CSP, DDoS, 最佳实践]
category: 后端开发
draft: false
---

## 常见 Web 安全威胁

在部署一个面向公网的 Web 应用时，必须考虑以下安全威胁：

### 1. XSS（跨站脚本攻击）

攻击者通过注入恶意脚本，在用户浏览器中执行非法操作。

**防护措施**：
- 对用户输入进行严格的验证和转义
- 使用 Content-Security-Policy (CSP) 头
- 设置 Cookie 的 `HttpOnly` 和 `Secure` 属性

### 2. CSRF（跨站请求伪造）

攻击者诱导用户在已认证的网站上执行非预期的操作。

**防护措施**：
- 使用 CSRF Token
- 验证 `Origin` / `Referer` 头
- 使用 `SameSite` Cookie 属性

### 3. DDoS 攻击

分布式拒绝服务攻击，通过大量请求耗尽服务器资源。

**防护措施**：
- 使用 CDN 服务（Cloudflare、AWS CloudFront）
- 配置速率限制（Rate Limiting）
- 启用 WAF（Web Application Firewall）
- 使用反向代理（Nginx）进行连接限制

## 安全 HTTP 头配置

以下是在 Nginx 中配置安全头的示例：

```nginx
# Content Security Policy
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';";

# 防止点击劫持
add_header X-Frame-Options "DENY";

# 防止 MIME 类型嗅探
add_header X-Content-Type-Options "nosniff";

# 启用浏览器 XSS 过滤器
add_header X-XSS-Protection "1; mode=block";

# HTTP 严格传输安全
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload";
```

## Cloudflare DDoS 防护

Cloudflare 提供免费的企业级 DDoS 防护：

1. **Anycast 网络**：全球 300+ 数据中心分散攻击流量
2. **Layer 3/4 防护**：自动缓解 TCP/UDP/ICMP 洪水攻击
3. **Layer 7 防护**：智能识别和拦截 HTTP 洪水攻击
4. **Rate Limiting**：限制单个 IP 的请求频率

## 总结

Web 安全是一个持续的过程。除了技术层面的防护，定期安全审计、保持依赖更新、遵循最小权限原则同样重要。
