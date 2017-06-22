'use strict'

;(function() {

  const resolveSockURI = function() {
    let o = /[?&]HOST_PORT=(wss?:\/\/[^&\/]+)/.exec(location.search)
    return o && o[1]
  }

  const RECONNECT_TIMEOUT = 2000
  const RECONNECT_RETRY = 5

  class Layer extends EventEmitter {
    constructor() {
      super()

      this.type = false
      this.features = []

      window.addEventListener('message', e => {
        this.emit('message', {
          type: 'window',
          message: e.data
        })
      })
    }
    supports(feature) {
      return this.features.indexOf(feature) !== -1
    }
    connect() { return true }
    request(feature) { return false }
  }

  class WSLayer extends Layer {

    constructor() {
      super()

      this.type = 'ws'
      this.features = ['end', 'capture']

      this.uri = resolveSockURI()

      if(this.uri === 'ws://:10501') {
        this.uri = 'ws://localhost:10501'
      }
      this.uri += '/MiniParse'

      this.canRetry = RECONNECT_RETRY
      this.retryTimeout = null

      window.addEventListener('message', e => {
        this.emit('message', e.data)
      })


    }

    connect() {
      if(!this.uri) return false
      this.ws = new WebSocket(this.uri)

      this.ws.onmessage = e => {
        this.canRetry = RECONNECT_RETRY
        this._onmessage(e)
      }
      this.ws.onerror = e => {
        this.ws.close()
        console.error(e)
      }
      this.ws.onclose = e => {
        if(!this.canRetry) return
        this.emit('closed', {
          code: e.code,
          reconnecting: this.canRetry--
        })
        this.retryTimeout = setTimeout(_ => {
          this.connect()
        }, 2000)
      }

    }

    request(feature) {
      switch(feature) {
        case 'end':
          this._send('RequestEnd')
        case 'capture':
          this._send('Capture')
      }
    }

    _send(m) {
      if(this.ws.readyState === 1) {
        this.ws.send(m)
        return true
      } else return false
    }

    _onmessage(e) {
      if(e.data === '.') {
        this._send('.') // pong!
        return
      }

      let d

      try {
        d = JSON.parse(e.data)
      } catch(err) {
        console.error(err, e.data)
        return
      }

      if(d.type == 'broadcast') {

        switch(d.msgtype) {
          case 'broadcast':
            this.emit('message', {
              type: 'broadcast',
              from: d.from,
              message: d.msg
            })
            break

          case 'CombatData':
            this.emit('data', d.msg)
            break

        }
      } else if(d.type == 'send') {
        this.emit('message', {
          type: 'single',
          from: d.from,
          message: d.msg
        })
      }

    }

  }

  class LegacyLayer extends Layer {

    constructor() {
      super()
      this.type = 'legacy'
      this.connected = false
      this.features = []
      if(window.OverlayPluginApi && window.OverlayPluginApi.endEncounter) {
        this.features.push('end')
      }
    }

    connect() {
      if(this.connected) return
      document.addEventListener('onOverlayDataUpdate', e => {
        this.emit('data', e.detail)
      })
      document.addEventListener('onBroadcastMessageReceive', e => {
        this.emit('message', {
          type: 'broadcast',
          message: e.detail.message
        })
      })
      document.addEventListener('onRecvMessage', e => {
        this.emit('message', {
          type: 'single',
          message: e.detail.message
        })
      })
      document.addEventListener('onLogLine', e => {
        this.emit('logline', {
          type: 'echo',
          message: e.detail.message
        })
      })
      this.connected = true
    }

    request(feature) {
      if(feature === 'end'
      && 'OverlayPluginApi' in window
      && 'endEncounter' in window.OverlayPluginApi) {
        window.OverlayPluginApi.endEncounter()
        return true
      }
      return false
    }
  }

  window.WSLayer = WSLayer
  window.LegacyLayer = LegacyLayer

  if(resolveSockURI()) {
    window.layer = new WSLayer()
  } else {
    window.layer = new LegacyLayer()
  }

})()
