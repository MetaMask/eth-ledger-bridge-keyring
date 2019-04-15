const browserify = require('browserify');
const gulp       = require('gulp');
const babelify       = require('babelify');
const source     = require('vinyl-source-stream');
const browserSync = require('browser-sync').create();

const paths = {
  scripts: {
    source: './main.js',
    destination: './',
    filename: 'bundle.js',
    watch: ['./main.js', 'ledger-bridge.js']
  }
}

gulp.task('scripts', function() {

  const bundle = browserify({
    entries: [paths.scripts.source],
    debug: false,
    transform: [babelify],
  });

  return bundle.bundle()
    .pipe(source(paths.scripts.filename))
    .pipe(gulp.dest(paths.scripts.destination))
});

gulp.task('watch', function() {
  gulp.watch(paths.scripts.watch, gulp.series('scripts'));
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