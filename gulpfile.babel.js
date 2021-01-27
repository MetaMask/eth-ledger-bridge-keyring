const browserify = require('browserify');
const gulp = require('gulp');
const babelify = require('babelify');
const source = require('vinyl-source-stream');
const browserSync = require('browser-sync').create();
const merge = require('merge-stream');

const paths = {
  scripts: [
    {
      source: './main.js',
      destination: './',
      filename: 'bundle.js',
      watch: ['./main.js', 'ledger-bridge.js']
    },
    {
      source: './main-live.js',
      destination: './',
      filename: 'bundle-live.js',
      watch: ['./main-live.js', 'ledger-live-bridge.js']
    }
  ]
}

gulp.task('scripts', function() {
  const pipes = paths.scripts.map(script => {
      const bundle = browserify({
        entries: [script.source],
        debug: false,
        transform: [babelify],
      })
      
      return bundle.bundle()
              .pipe(source(script.filename))
              .pipe(gulp.dest(script.destination))
  })

  return merge(pipes)
});

gulp.task('watch', function() {
  paths.scripts.forEach(script => {
    gulp.watch(script.watch, gulp.series('scripts'));
  })
});


gulp.task('browser-sync', function() {
  browserSync.init({
      server: {
          baseDir: "./",
          port: 9000,
          https: true
      }
  });
});

gulp.task('default', gulp.parallel('scripts', 'watch', 'browser-sync'));