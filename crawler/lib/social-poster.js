const { BskyAgent, RichText } = require('@atproto/api')
const { TwitterApi } = require('twitter-api-v2')

class SocialPoster {
  constructor ({ crawlDb, config, env = process.env }) {
    this.crawlDb = crawlDb
    this.config = config || {}
    this.enabled = config?.enabled !== false

    if (!this.enabled) {
      console.log('[social] Social posting disabled in config')
      return
    }

    this.siteUrl = config.siteUrl || 'https://unredact.org'
    this.relevanceFloor = config.relevanceFloor || 0.7
    this.rateLimitPerHour = config.rateLimitPerHour || 10

    // Track posts this hour for rate limiting
    this._postTimestamps = []

    // Bluesky setup
    this.bluesky = null
    if (env.BLUESKY_USERNAME && env.BLUESKY_APP_PASSWORD) {
      this.bluesky = {
        username: env.BLUESKY_USERNAME,
        password: env.BLUESKY_APP_PASSWORD,
        agent: null,
      }
      console.log('[social] Bluesky configured for %s', env.BLUESKY_USERNAME)
    } else {
      console.log('[social] Bluesky credentials not set, skipping')
    }

    // Twitter/X setup
    this.twitter = null
    if (env.TWITTER_API_KEY && env.TWITTER_API_SECRET &&
        env.TWITTER_ACCESS_TOKEN && env.TWITTER_ACCESS_SECRET) {
      this.twitter = new TwitterApi({
        appKey: env.TWITTER_API_KEY,
        appSecret: env.TWITTER_API_SECRET,
        accessToken: env.TWITTER_ACCESS_TOKEN,
        accessSecret: env.TWITTER_ACCESS_SECRET,
      })
      console.log('[social] Twitter/X configured')
    } else {
      console.log('[social] Twitter/X credentials not set, skipping')
    }

    if (!this.bluesky && !this.twitter) {
      console.log('[social] No social platforms configured, social posting disabled')
      this.enabled = false
    }
  }

  async post (result) {
    if (!this.enabled) return
    if (!result || !result.indexed) return
    if ((result.score || 0) < this.relevanceFloor) return

    // Dedup check
    const docId = result.id || result.url
    if (this.crawlDb.hasPosted(docId)) return

    // Rate limit check
    if (this._isRateLimited()) {
      console.log('[social] Rate limited, skipping post for: %s', (result.title || '').slice(0, 50))
      return
    }

    const archiveUrl = this.siteUrl + '/documents/' + encodeURIComponent(docId)
    const platforms = []

    // Post to Bluesky
    if (this.bluesky) {
      try {
        await this._postBluesky(result, archiveUrl)
        platforms.push('bluesky')
      } catch (err) {
        console.error('[social] Bluesky post failed: %s', err.message)
      }
    }

    // Post to Twitter/X
    if (this.twitter) {
      try {
        await this._postTwitter(result, archiveUrl)
        platforms.push('twitter')
      } catch (err) {
        console.error('[social] Twitter post failed: %s', err.message)
      }
    }

    if (platforms.length > 0) {
      this.crawlDb.recordPost(docId, platforms.join(','))
      this._postTimestamps.push(Date.now())
      console.log('[social] Posted to %s: %s', platforms.join(', '), (result.title || '').slice(0, 60))
    }
  }

  async _postBluesky (result, archiveUrl) {
    const agent = await this._getBlueskyAgent()

    const category = result.category ? ` [${result.category}]` : ''
    const title = (result.title || 'New document').slice(0, 220)
    const text = `${title}${category}\n\n${archiveUrl}`

    const rt = new RichText({ text })
    await rt.detectFacets(agent)

    await agent.post({
      text: rt.text,
      facets: rt.facets,
      embed: {
        $type: 'app.bsky.embed.external',
        external: {
          uri: archiveUrl,
          title: (result.title || 'Document').slice(0, 300),
          description: `Relevance: ${(result.score || 0).toFixed(2)}${category}`,
        },
      },
    })
  }

  async _postTwitter (result, archiveUrl) {
    const category = result.category ? ` [${result.category}]` : ''
    // 280 char limit — reserve space for URL (~23 chars via t.co) + category + newlines
    const maxTitleLen = 280 - 25 - category.length - 2
    const title = (result.title || 'New document').slice(0, maxTitleLen)
    const text = `${title}${category}\n${archiveUrl}`

    await this.twitter.v2.tweet(text)
  }

  async _getBlueskyAgent () {
    if (this.bluesky.agent) return this.bluesky.agent

    const agent = new BskyAgent({ service: 'https://bsky.social' })
    await agent.login({
      identifier: this.bluesky.username,
      password: this.bluesky.password,
    })
    this.bluesky.agent = agent
    return agent
  }

  _isRateLimited () {
    const oneHourAgo = Date.now() - 3600000
    this._postTimestamps = this._postTimestamps.filter(t => t > oneHourAgo)
    return this._postTimestamps.length >= this.rateLimitPerHour
  }
}

module.exports = SocialPoster
